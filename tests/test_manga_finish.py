import asyncio
from dataclasses import asdict
from io import BytesIO
import threading
import importlib.util
from pathlib import Path
import numpy as np
import pytest
from PIL import Image
from speech_bubble_forge.manga_finish import *
from speech_bubble_forge.manga_finish_service import MangaFinishService, BusyError

def png(size=(137,111),alpha=123):
    im=Image.new('RGBA',size,(90,120,150,alpha)); b=BytesIO();im.save(b,format='PNG');return b.getvalue()

def test_alpha_and_dimensions():
    assert MangaFinishSettings().gradation == 1.0
    assert validate_settings({}).gradation == 1.0
    result=convert_image(png(),MangaFinishSettings())
    arr=np.asarray(Image.open(BytesIO(result.png)))
    assert arr.shape==(111,137,4)
    assert np.all(arr[:,:,3]==123)
    assert np.array_equal(arr[:,:,0],arr[:,:,1])
    assert convert_image(png((1,1)),MangaFinishSettings()).width==1

def test_decode_boundaries_and_orientation():
    assert decode_rgba(png((8192,1))).shape == (1,8192,4)
    with pytest.raises(ImageTooLarge):decode_rgba(png((8193,1)))
    with pytest.raises(ImageTooLarge):decode_rgba(png((5000,4001)))
    im=Image.new('RGB',(37,23),'white'); exif=Image.Exif();exif[274]=6
    out=BytesIO();im.save(out,format='JPEG',exif=exif)
    assert decode_rgba(out.getvalue()).shape==(37,23,4)
    animated=BytesIO();Image.new('RGB',(8,8),'white').save(animated,format='PNG',save_all=True,append_images=[Image.new('RGB',(8,8),'black')])
    with pytest.raises(ValueError):decode_rgba(animated.getvalue())

@pytest.mark.parametrize('raw',[{'screen_lines':True},{'screen_lines':80.5},{'gradation':float('nan')},{'white_point':.45,'black_point':.44},{'light_tone':.5,'dark_tone':.2},{'white_lines':.4},{'x':1}])
def test_invalid_settings(raw):
    with pytest.raises(ValueError):validate_settings(raw)

def test_tiled_matches_original():
    def original(cover,pitch):
        h,w=cover.shape;y,x=np.mgrid[0:h*3,0:w*3].astype(np.float32);a=np.deg2rad(45.)
        u=(x*np.cos(a)+y*np.sin(a))/(pitch*3);v=(-x*np.sin(a)+y*np.cos(a))/(pitch*3)
        spot=1-(np.cos(2*np.pi*u)+np.cos(2*np.pi*v)+2)/4
        c=cv2.resize(cover,(w*3,h*3),interpolation=cv2.INTER_LINEAR)
        return cv2.resize((spot<c).astype(np.float32),(w,h),interpolation=cv2.INTER_AREA)>.5
    for shape in ((111,143),(257,255),(513,257)):
        cover=np.random.default_rng(22).random(shape,dtype=np.float32)
        for lines in (80,200,280,400):
            expected=original(cover,shape[1]/lines)
            for tile in (128,256):assert np.array_equal(expected,print_screen_tiled(cover,shape[1]/lines,tile))

def test_cancel_retains_slot(monkeypatch):
    from speech_bubble_forge import manga_finish
    started=threading.Event();end=threading.Event()
    def work(*args):started.set();end.wait(5);return None
    monkeypatch.setattr(manga_finish,'convert_image',work)
    async def run():
        service=MangaFinishService();lease=service.reserve()
        task=asyncio.create_task(service.convert(lease,b'',None))
        while not started.is_set():await asyncio.sleep(.001)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):await task
        with pytest.raises(BusyError):service.reserve()
        end.set()
        for _ in range(1000):
            if service.lease is None:break
            await asyncio.sleep(.001)
        assert service.lease is None
        await service.close()
    asyncio.run(run())
