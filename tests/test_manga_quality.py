from dataclasses import replace
from io import BytesIO
import numpy as np
import pytest
from PIL import Image, ImageDraw
from speech_bubble_forge.manga_finish import (
    MangaFinishSettings, convert_image, finish_rgb, print_screen_tiled,
    validate_settings,
)


def dark_fixture(size=(896,1184)):
    w,h=size
    ramp=np.tile(np.linspace(24,130,w,dtype=np.uint8),(h,1))
    rgb=np.stack([ramp,ramp,np.minimum(ramp.astype(int)+25,255).astype(np.uint8)],axis=2)
    im=Image.fromarray(rgb)
    draw=ImageDraw.Draw(im)
    draw.ellipse((w//4,h//8,3*w//4,h//2),fill=(235,195,170),outline='black',width=5)
    draw.line((20,h-30,w-20,30),fill='black',width=6)
    draw.rectangle((10,10,80,80),fill='white')
    return np.asarray(im)


def test_auto_preserves_dark_detail_at_native_resolution():
    rgb=dark_fixture()
    normal=finish_rgb(rgb,MangaFinishSettings())
    auto=finish_rgb(rgb,MangaFinishSettings(auto_tone=True))
    assert auto.shape==(1184,896)
    assert (auto==0).mean() < (normal==0).mean()-.12
    assert auto[40,40]==255
    # The center of the thick diagonal remains ink.
    assert auto[592,448] < 40


@pytest.mark.parametrize('halftone',[True,False])
def test_aa_changes_only_edge_tones_and_preserves_alpha(halftone):
    rgb=dark_fixture((385,513))
    rgba=np.dstack([rgb,np.full(rgb.shape[:2],177,dtype=np.uint8)])
    stream=BytesIO();Image.fromarray(rgba).save(stream,format='PNG')
    outputs=[]
    for level in (0,1,2):
        result=convert_image(stream.getvalue(),MangaFinishSettings(auto_tone=True,antialias=level,halftone=halftone))
        pixels=np.asarray(Image.open(BytesIO(result.png)))
        assert pixels.shape==rgba.shape
        assert np.all(pixels[:,:,3]==177)
        outputs.append(pixels[:,:,0].astype(float))
    assert np.any(outputs[1]!=outputs[0])
    assert np.mean(abs(outputs[2]-outputs[0])) > np.mean(abs(outputs[1]-outputs[0]))
    if halftone:
        assert np.array_equal(outputs[0]<128,outputs[1]<128)


def test_aa_screen_is_independent_of_tile_size():
    cover=np.random.default_rng(4).random((517,519),dtype=np.float32)
    assert np.array_equal(print_screen_tiled(cover,4.2,tile=128,antialias=1),
                          print_screen_tiled(cover,4.2,tile=256,antialias=1))


def test_auto_keeps_binary_art_and_bright_input():
    binary=np.zeros((131,137,3),np.uint8);binary[:,70:]=255
    bright=np.full((131,137,3),220,np.uint8)
    for rgb in (binary,bright):
        assert np.array_equal(finish_rgb(rgb,MangaFinishSettings()),finish_rgb(rgb,MangaFinishSettings(auto_tone=True)))


@pytest.mark.parametrize('value',[True,-1,3,1.5,'1'])
def test_invalid_antialias(value):
    with pytest.raises(ValueError):validate_settings({'antialias':value})
