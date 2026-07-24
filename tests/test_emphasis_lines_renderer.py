from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPEC = spec_from_file_location(
    "speech_bubble_renderer",
    ROOT / "speech_bubble_forge" / "renderer.py",
)
renderer = module_from_spec(SPEC)
SPEC.loader.exec_module(renderer)


def test_presets_and_determinism():
    assert renderer._EMPHASIS_EDGE_OVERSHOOT == 0.035
    for preset_id, preset in renderer._EMPHASIS_PRESETS.items():
        assert preset["line_length"] == 1
        assert preset["length_random"] == 0
        assert preset["inner_random"] == 0.5
        assert preset["taper"] == 1
        source = {**preset, "preset": preset_id, "seed": 1234}
        first = renderer._generate_emphasis_rays(source, 1024, 1024)
        second = renderer._generate_emphasis_rays(source, 1024, 1024)
        assert first == second
        assert first
        assert renderer._validated_emphasis_rays(first)

    normalized = renderer._normalize_emphasis_params({
        **renderer._EMPHASIS_PRESETS["center"],
        "preset": "center",
        "inner_x": 0.75,
        "inner_y": 0.75,
        "overshoot": 0.12,
    })
    assert normalized["inner_x"] == 0.65
    assert normalized["inner_y"] == 0.65
    assert normalized["overshoot"] == renderer._EMPHASIS_EDGE_OVERSHOOT


def test_center_random_preserves_outer_endpoints():
    source = {
        **renderer._EMPHASIS_PRESETS["center"],
        "preset": "center",
        "seed": 987654321,
        "inner_random": 0.0,
        "line_length": 1.0,
        "length_random": 0.0,
    }
    flat_rays = renderer._generate_emphasis_rays(source, 1024, 1024)
    random_rays = renderer._generate_emphasis_rays(
        {**source, "inner_random": 0.5},
        1024,
        1024,
    )
    assert len(flat_rays) == len(random_rays)
    assert all(
        flat[1] == random[1] and flat[2] == random[2]
        for flat, random in zip(flat_rays, random_rays)
    )
    assert any(
        flat[0] != random[0] or flat[3] != random[3]
        for flat, random in zip(flat_rays, random_rays)
    )
    maximum_rays = renderer._generate_emphasis_rays(
        {
            **renderer._EMPHASIS_PRESETS["center"],
            "preset": "center",
            "line_count": 500,
            "seed": 3,
        },
        1024,
        1024,
    )
    assert 0 < len(maximum_rays) <= 500


def test_stored_rays_and_overlay_render():
    stored_rays = [[
        [0.45, 0.45],
        [1.05, 0.35],
        [1.05, 0.65],
        [0.45, 0.55],
    ]]
    element = {
        "type": "emphasis_lines",
        "preset": "center",
        "x": 0,
        "y": 0,
        "w": 256,
        "h": 256,
        "color": "#e53935",
        "opacity": 0.75,
        "rays": stored_rays,
    }
    layer = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    renderer._draw_emphasis_lines(layer, element, 1)
    assert layer.getbbox() is not None
    assert renderer._validated_emphasis_rays(element["rays"]) == stored_rays

    overlay, _ = renderer.render_overlay(
        256,
        256,
        {
            "version": 1,
            "canvas": {"width": 256, "height": 256},
            "elements": [element],
        },
        supersample=2,
    )
    assert overlay.getbbox() is not None


def test_missing_rays_fallback():
    element = {
        "type": "emphasis_lines",
        "preset": "side",
        **renderer._EMPHASIS_PRESETS["side"],
        "seed": 5,
        "x": 0,
        "y": 0,
        "w": 256,
        "h": 256,
        "color": "#000000",
        "opacity": 1,
    }
    layer = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    renderer._draw_emphasis_lines(layer, element, 1)
    assert layer.getbbox() is not None


if __name__ == "__main__":
    test_presets_and_determinism()
    test_center_random_preserves_outer_endpoints()
    test_stored_rays_and_overlay_render()
    test_missing_rays_fallback()
    print("test_emphasis_lines_renderer: OK")
