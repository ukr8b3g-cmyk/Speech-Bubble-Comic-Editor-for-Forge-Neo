import asyncio
import builtins
from io import BytesIO
import threading

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
import pytest

from speech_bubble_forge import manga_finish
from speech_bubble_forge.manga_finish_routes import API_PATH, register_manga_routes
from speech_bubble_forge.manga_finish_service import MangaFinishService, UnavailableError


def png():
    out = BytesIO()
    Image.new('RGBA', (129, 131), (80, 130, 180, 123)).save(out, format='PNG')
    return out.getvalue()


@pytest.fixture
def client():
    app = FastAPI()
    register_manga_routes(app)
    register_manga_routes(app)
    assert sum(getattr(route, 'path', None) == API_PATH for route in app.routes) == 1
    with TestClient(app) as client:
        yield client
    assert not app.state.speech_bubble_manga_finish.accepting


@pytest.mark.parametrize('query', [
    'gradation=nan', 'gradation=inf', 'white_lines=1', 'screen_lines=80&screen_lines=90',
    'screen_lines=80.5', 'token=desktop', 'x=1', 'black_point=0.7&white_point=0.7',
    'light_tone=0.5&dark_tone=0.2',
])
def test_invalid_settings(client, query):
    assert client.post(API_PATH+'?'+query, content=png()).status_code == 422
    assert client.app.state.speech_bubble_manga_finish.lease is None


def test_api_and_input_limits(client):
    assert client.post(API_PATH, content=b'broken').status_code == 400
    assert client.post(API_PATH, content=b'').status_code == 400
    for length, status in [('bogus', 400), ('-1', 400), (str(manga_finish.MAX_BYTES+1), 413)]:
        assert client.post(API_PATH, content=b'x', headers={'Content-Length': length}).status_code == status
    service = client.app.state.speech_bubble_manga_finish
    assert service.lease is None
    lease = service.reserve()
    response = client.post(API_PATH, content=png())
    assert response.status_code == 429
    assert response.headers['retry-after'] == '1'
    service.release(lease)
    response = client.post(API_PATH, content=png())
    assert response.status_code == 200, response.text
    assert response.headers['content-type'] == 'image/png'
    assert response.headers['cache-control'] == 'no-store'
    assert response.headers['x-sbe-image-width'] == '129'
    assert response.headers['x-sbe-image-height'] == '131'
    with Image.open(BytesIO(response.content)) as result:
        assert result.mode == 'RGBA'
        assert result.getpixel((0, 0))[3] == 123


def test_unavailable_does_not_break_other_routes(client, monkeypatch):
    original = builtins.__import__
    def blocked(name, *args, **kwargs):
        if name == 'manga_finish':
            raise ImportError('simulated missing cv2')
        return original(name, *args, **kwargs)
    monkeypatch.setattr(builtins, '__import__', blocked)
    response = client.post(API_PATH, content=png(), headers={'X-SBE-Language': 'en'})
    assert response.status_code == 503
    assert 'OpenCV' in response.json()['detail']
    assert client.get('/openapi.json').status_code == 200


def test_failure_releases_slot(client, monkeypatch):
    def fail(*args):
        raise RuntimeError('simulated worker failure')
    monkeypatch.setattr(manga_finish, 'convert_image', fail)
    assert client.post(API_PATH, content=png()).status_code == 500
    assert client.app.state.speech_bubble_manga_finish.lease is None


def test_streaming_size_limit_releases_slot(client, monkeypatch):
    monkeypatch.setattr(manga_finish, 'MAX_BYTES', 16)
    response = client.post(API_PATH, content=iter([b'x' * 9, b'y' * 9]))
    assert response.status_code == 413
    assert client.app.state.speech_bubble_manga_finish.lease is None


def test_register_after_startup_preserves_host_shutdown():
    app = FastAPI()
    events = []
    app.router.add_event_handler('shutdown', lambda: events.append('host'))
    with TestClient(app) as client:
        register_manga_routes(app)
        assert client.post(API_PATH, content=png()).status_code == 200
    assert events == ['host']
    assert not app.state.speech_bubble_manga_finish.accepting


def test_concurrent_reservations_and_shutdown():
    service = MangaFinishService()
    barrier = threading.Barrier(8)
    accepted = []
    def reserve():
        from speech_bubble_forge.manga_finish_service import BusyError
        barrier.wait()
        try:
            accepted.append(service.reserve())
        except BusyError:
            pass
    threads = [threading.Thread(target=reserve) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert len(accepted) == 1
    service.release(object())
    assert service.lease is accepted[0]
    service.release(accepted[0])
    asyncio.run(service.close())
    with pytest.raises(UnavailableError):
        service.reserve()


def test_forge_unload_closes_service_with_custom_host_lifespan():
    """Exercise the real loader callbacks without importing/starting Forge or a GPU."""
    import ast
    from contextlib import asynccontextmanager
    from pathlib import Path

    source = Path('scripts/speech_bubble_forge.py').read_text(encoding='utf-8')
    tree = ast.parse(source)
    names = {'_on_app_started', '_on_script_unloaded'}
    callbacks = ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names], type_ignores=[])
    namespace = {'_manga_finish_service': None, 'register_routes': register_manga_routes}
    exec(compile(callbacks, 'scripts/speech_bubble_forge.py', 'exec'), namespace)
    assert any(isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
               and node.func.attr == 'on_script_unloaded'
               and isinstance(node.args[0], ast.Name) and node.args[0].id == '_on_script_unloaded'
               for node in ast.walk(tree))
    events = []
    @asynccontextmanager
    async def host_lifespan(app):
        events.append('start')
        yield
        events.append('stop')

    app = FastAPI(lifespan=host_lifespan)
    with TestClient(app) as client:
        namespace['_on_app_started'](None, app)
        service = app.state.speech_bubble_manga_finish
        assert client.post(API_PATH, content=png()).status_code == 200
    assert events == ['start', 'stop']
    # Like Gradio, this custom lifespan doesn't call the router shutdown list.
    assert service.accepting
    namespace['_on_script_unloaded']()
    namespace['_on_script_unloaded']()  # Reload cleanup is idempotent.
    assert not service.accepting
    assert all(not thread.is_alive() for thread in service.executor._threads)
