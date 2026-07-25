from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SPEC = spec_from_file_location(
    "speech_bubble_renderer",
    ROOT / "speech_bubble_forge" / "renderer.py",
)
renderer = module_from_spec(SPEC)
SPEC.loader.exec_module(renderer)


def _font_candidates():
    return [
        Path("C:/Windows/Fonts/meiryo.ttc"),
        Path("C:/Windows/Fonts/YuGothM.ttc"),
        Path("C:/Windows/Fonts/msgothic.ttc"),
        Path("C:/Windows/Fonts/BIZ-UDGothicR.ttc"),
        Path("C:/Windows/Fonts/NotoSansJP-VF.ttf"),
        Path("C:/Windows/Fonts/yumin.ttf"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/noto/NotoSansJP-Regular.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]


def _test_font_path():
    path = next((candidate for candidate in _font_candidates() if candidate.is_file()), None)
    if path is None:
        raise RuntimeError("No vertical text regression font is available")
    return path


def test_vertical_policy_and_graphemes():
    assert renderer._vertical_grapheme_policy("2")[0] == "upright-center"
    assert renderer._vertical_grapheme_policy("ー")[0] == "rotate-clockwise"
    assert renderer._vertical_grapheme_policy("「")[0] == "rotate-clockwise"
    assert renderer._vertical_grapheme_policy("…")[0] == "rotate-clockwise"
    assert renderer._vertical_grapheme_policy("。")[0] == "upright-top-right"
    assert renderer._vertical_grapheme_policy("ゃ")[0] == "upright-top-right"
    assert renderer._segment_vertical_graphemes("か\u3099き\u3099") == [
        "か\u3099",
        "き\u3099",
    ]
    assert renderer._segment_vertical_graphemes("👩\u200d💻") == ["👩\u200d💻"]
    columns, _, _, _, height = renderer._vertical_text_content_metrics(
        "2おおー",
        54,
        0,
    )
    assert len(columns[0]) == 4
    assert height == 4 * 54 * 1.15


def test_vertical_sprite_rotation_and_alpha_centering():
    font_path = _test_font_path()
    font_size = 54
    font = renderer._font(str(font_path), font_size)
    digit = renderer._render_vertical_glyph_sprite(
        "2",
        "upright-center",
        font,
        str(font_path),
        font_size,
        (0, 0, 0, 255),
        (255, 255, 255, 255),
        0,
        False,
    )
    long_mark = renderer._render_vertical_glyph_sprite(
        "ー",
        "rotate-clockwise",
        font,
        str(font_path),
        font_size,
        (0, 0, 0, 255),
        (255, 255, 255, 255),
        0,
        False,
    )
    assert digit is not None and digit.getbbox() is not None
    assert long_mark is not None and long_mark.getbbox() is not None
    assert long_mark.height > long_mark.width

    local = Image.new("RGBA", (180, 180), (0, 0, 0, 0))
    element = {"text": "2", "writing": "vertical"}
    renderer._draw_vertical_text_columns(
        local,
        element,
        font,
        str(font_path),
        font_size,
        20,
        20,
        0,
        (0, 0, 0, 255),
        0,
        (255, 255, 255, 255),
        False,
    )
    alpha_bounds = local.getchannel("A").getbbox()
    assert alpha_bounds is not None
    actual_center_x = (alpha_bounds[0] + alpha_bounds[2]) / 2
    expected_center_x = 180 - 20 - font_size * 1.2 / 2
    assert abs(actual_center_x - expected_center_x) <= 1.5


def test_windows_japanese_font_matrix():
    font_paths = [
        Path("C:/Windows/Fonts/meiryo.ttc"),
        Path("C:/Windows/Fonts/YuGothM.ttc"),
        Path("C:/Windows/Fonts/msgothic.ttc"),
        Path("C:/Windows/Fonts/NotoSansJP-VF.ttf"),
        Path("C:/Windows/Fonts/yumin.ttf"),
    ]
    available = [path for path in font_paths if path.is_file()]
    if not available:
        available = [_test_font_path()]
    for font_path in available:
        font = renderer._font(str(font_path), 54)
        digit = renderer._render_vertical_glyph_sprite(
            "2",
            "upright-center",
            font,
            str(font_path),
            54,
            (0, 0, 0, 255),
            (255, 255, 255, 255),
            2,
            False,
        )
        long_mark = renderer._render_vertical_glyph_sprite(
            "ー",
            "rotate-clockwise",
            font,
            str(font_path),
            54,
            (0, 0, 0, 255),
            (255, 255, 255, 255),
            2,
            False,
        )
        assert digit is not None and digit.getbbox() is not None, font_path
        assert long_mark is not None and long_mark.getbbox() is not None, font_path
        assert long_mark.height > long_mark.width, (font_path, long_mark.size)


def test_vertical_decorations_follow_column_direction():
    font_path = _test_font_path()
    font_size = 54
    font = renderer._font(str(font_path), font_size)
    column_width = font_size * 1.2
    cases = [
        ("vertical-rl", "underline", 180 - 20 - column_width + column_width * 0.88),
        ("vertical-lr", "underline", 20 + column_width * 0.12),
        ("vertical-rl", "strikethrough", 180 - 20 - column_width + column_width * 0.5),
    ]
    for writing, decoration, expected_x in cases:
        local = Image.new("RGBA", (180, 180), (0, 0, 0, 0))
        element = {
            "text": "",
            "writing": writing,
            "underline": decoration == "underline",
            "strikethrough": decoration == "strikethrough",
        }
        renderer._draw_vertical_text_columns(
            local,
            element,
            font,
            str(font_path),
            font_size,
            20,
            20,
            0,
            (0, 0, 0, 255),
            0,
            (255, 255, 255, 255),
            False,
        )
        alpha_bounds = local.getchannel("A").getbbox()
        assert alpha_bounds is not None
        actual_center_x = (alpha_bounds[0] + alpha_bounds[2]) / 2
        assert abs(actual_center_x - expected_x) <= 2


def test_draw_text_layer_vertical_integration_stays_inside_box():
    font_path = _test_font_path()
    for writing in ("vertical", "vertical-rl", "vertical-lr"):
        layer = Image.new("RGBA", (320, 360), (0, 0, 0, 0))
        element = {
            "type": "text",
            "x": 80,
            "y": 30,
            "w": 80,
            "h": 280,
            "text": "2おおー",
            "writing": writing,
            "font_path": str(font_path),
            "font_size": 54,
            "tracking": 0,
            "font_scale_x": 100,
            "font_scale_y": 100,
            "color": "#111111",
            "stroke_color": "#ffffff",
            "stroke_width": 2,
            "underline": True,
            "strikethrough": True,
            "opacity": 1,
        }
        renderer._draw_text_layer(layer, element, str(font_path), 1)
        alpha_bounds = layer.getchannel("A").getbbox()
        assert alpha_bounds is not None, writing
        assert alpha_bounds[0] >= element["x"], (writing, alpha_bounds)
        assert alpha_bounds[1] >= element["y"], (writing, alpha_bounds)
        assert alpha_bounds[2] <= element["x"] + element["w"], (writing, alpha_bounds)
        assert alpha_bounds[3] <= element["y"] + element["h"], (writing, alpha_bounds)


if __name__ == "__main__":
    test_vertical_policy_and_graphemes()
    test_vertical_sprite_rotation_and_alpha_centering()
    test_windows_japanese_font_matrix()
    test_vertical_decorations_follow_column_direction()
    test_draw_text_layer_vertical_integration_stays_inside_box()
    print("test_vertical_text_renderer: OK", _test_font_path())
