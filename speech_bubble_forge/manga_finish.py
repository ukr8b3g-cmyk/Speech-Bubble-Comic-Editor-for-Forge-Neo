"""CPU manga finishing. Derived from MangaScreen/Mangazin, copyright 2026 ashukae, MIT.
See THIRD-PARTY-NOTICES.md for the complete license.
"""
from dataclasses import dataclass, asdict
from decimal import Decimal
from io import BytesIO
import math
import time
import warnings
import cv2
import numpy as np
from PIL import Image, ImageOps

MAX_BYTES = 64 * 1024 * 1024
MAX_PIXELS = 20_000_000
MAX_EDGE = 8192

class ImageTooLarge(ValueError): pass

@dataclass(frozen=True)
class MangaFinishSettings:
    screen_lines: int = 200
    white_point: float = .80
    black_point: float = .30
    light_tone: float = .18
    dark_tone: float = .42
    gradation: float = 1.0
    white_lines: bool = True
    halftone: bool = True
    auto_tone: bool = False
    antialias: int = 0

@dataclass(frozen=True)
class ConversionResult:
    png: bytes
    width: int
    height: int
    elapsed_ms: float

RANGES = {"screen_lines":(80,400), "white_point":(.45,.95), "black_point":(.05,.70),
          "light_tone":(.02,.50), "dark_tone":(.20,.85), "gradation":(0,1)}

def validate_settings(raw):
    values=asdict(MangaFinishSettings())
    if not isinstance(raw,dict) or set(raw)-set(values): raise ValueError("Unknown setting")
    values.update(raw)
    for key,(low,high) in RANGES.items():
        v=values[key]
        if type(v) not in (int,float) or not math.isfinite(v) or not low<=v<=high:
            raise ValueError("Invalid "+key)
    if type(values['screen_lines']) is not int: raise ValueError('screen_lines must be an integer')
    for key in ('white_lines','halftone','auto_tone'):
        if type(values[key]) is not bool: raise ValueError(key+' must be Boolean')
    if type(values['antialias']) is not int or values['antialias'] not in (0, 1, 2):
        raise ValueError('Invalid antialias')
    if Decimal(str(values['white_point']))-Decimal(str(values['black_point']))<Decimal('.02'):
        raise ValueError('White point must exceed black point by .02')
    if values['light_tone']>values['dark_tone']: raise ValueError('Light tone must not exceed dark tone')
    return MangaFinishSettings(**values)

def decode_rgba(raw):
    if len(raw)>MAX_BYTES: raise ImageTooLarge('Image too large')
    if not raw: raise ValueError('Empty image')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw)) as im:
                if im.format not in {'PNG','JPEG','WEBP','BMP'} or getattr(im,'n_frames',1)!=1:
                    raise ValueError('Unsupported image format or animation')
                if max(im.size)>MAX_EDGE or im.width*im.height>MAX_PIXELS: raise ImageTooLarge('Image too large')
                return np.asarray(ImageOps.exif_transpose(im).convert('RGBA')).copy()
    except (Image.DecompressionBombWarning,Image.DecompressionBombError) as e:
        raise ImageTooLarge('Image too large') from e

def finish_rgb(rgb,settings):
    params = asdict(settings)
    auto = params.pop('auto_tone')
    if auto:
        # One bounded global curve, measured on the original input. Preserve
        # pure black/white and avoid changing already monochrome drawings.
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        sample = gray[::max(1, gray.shape[0]//512), ::max(1, gray.shape[1]//512)]
        tones = sample[(sample > 8) & (sample < 247)]
        if tones.size > sample.size * .05:
            median = max(float(np.median(tones))/255, .01)
            gamma = min(1., max(.50, math.log(.48)/math.log(min(median,.99))))
            lut = np.round((np.arange(256)/255.)**gamma*255).astype(np.uint8)
            rgb = cv2.LUT(rgb, lut)
    return _reference_finish(rgb,**params)

def convert_image(raw,settings):
    start=time.perf_counter()
    rgba=decode_rgba(raw)
    alpha=rgba[:,:,3:4].astype(np.float32)/255
    rgb=np.clip(rgba[:,:,:3].astype(np.float32)*alpha+255*(1-alpha),0,255).astype(np.uint8)
    gray=finish_rgb(rgb,settings)
    result=np.empty_like(rgba)
    result[:,:,:3]=gray[:,:,None]
    result[:,:,3]=rgba[:,:,3]
    result[rgba[:,:,3]==0,:3]=255
    out=BytesIO(); Image.fromarray(result).save(out,format='PNG')
    return ConversionResult(out.getvalue(),rgba.shape[1],rgba.shape[0],(time.perf_counter()-start)*1000)

def print_screen_tiled(cover, pitch, tile=256, antialias=0):
    h, w = cover.shape
    scale = 3
    result = np.empty((h, w), dtype=np.float32 if antialias else np.bool_)
    a = np.deg2rad(45.0)
    ca, sa = (np.cos(a), np.sin(a))
    for y0 in range(0, h, tile):
        y1 = min(h, y0 + tile)
        ya, yb = (max(0, y0 - 1), min(h, y1 + 1))
        for x0 in range(0, w, tile):
            x1 = min(w, x0 + tile)
            xa, xb = (max(0, x0 - 1), min(w, x1 + 1))
            enlarged = cv2.resize(cover[ya:yb, xa:xb], ((xb - xa) * scale, (yb - ya) * scale), interpolation=cv2.INTER_LINEAR)
            crop = enlarged[(y0 - ya) * scale:(y1 - ya) * scale, (x0 - xa) * scale:(x1 - xa) * scale]
            gy, gx = np.ogrid[y0 * scale:y1 * scale, x0 * scale:x1 * scale]
            gy = gy.astype(np.float32)
            gx = gx.astype(np.float32)
            u = (gx * ca + gy * sa) / (pitch * scale)
            v = (-gx * sa + gy * ca) / (pitch * scale)
            spot = 1 - (np.cos(2 * np.pi * u) + np.cos(2 * np.pi * v) + 2) / 4
            coverage = cv2.resize((spot < crop).astype(np.float32), (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA)
            result[y0:y1, x0:x1] = coverage if antialias else coverage > .5
    return result

def ink_layer(luma, k):
    solid = cv2.GaussianBlur(luma, (0, 0), 1.5 * k) < 0.22
    smooth = cv2.GaussianBlur(luma, (0, 0), 0.7 * k)
    line = (smooth < cv2.blur(smooth, (int(15 * k) | 1,) * 2) - 0.07) & (smooth < 0.65)
    _, labels, stats, _ = cv2.connectedComponentsWithStats(line.astype(np.uint8), connectivity=8)
    w, h, area = (stats[:, cv2.CC_STAT_WIDTH], stats[:, cv2.CC_STAT_HEIGHT], stats[:, cv2.CC_STAT_AREA])
    keep = (np.maximum(w, h) >= 10 * k) & (area >= 12 * k * k) & (area < 0.6 * w * h + 40 * k * k)
    keep |= area >= 400 * k * k
    keep[0] = False
    ink = solid | keep[labels]
    _, labels, stats, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8), connectivity=8)
    large = stats[:, cv2.CC_STAT_AREA] >= 6 * k * k
    large[0] = False
    return large[labels]

def value_map(luma, ink, k):
    mask = (~ink).astype(np.float32)
    sigma = 2.5 * k
    values = cv2.GaussianBlur(luma * mask, (0, 0), sigma) / np.maximum(cv2.GaussianBlur(mask, (0, 0), sigma), 0.001)
    for _ in range(2):
        values = cv2.bilateralFilter(values, int(9 * k) | 1, 0.1, 9 * k)
    return values

def tone_plan(values, k, white, split, black, min_region=600):
    levels = cv2.medianBlur(np.digitize(-values, [-white, -split, -black]).astype(np.uint8), int(11 * k) | 1)
    for level_id in (1, 2, 3, 0):
        _, labels, stats, _ = cv2.connectedComponentsWithStats((levels == level_id).astype(np.uint8), connectivity=4)
        small = stats[:, cv2.CC_STAT_AREA] < min_region * k * k
        small[0] = False
        holes = small[labels]
        if holes.any():
            fill = cv2.medianBlur(np.where(holes, 255, levels).astype(np.uint8), int(21 * k) | 1)
            levels = np.where(holes & (fill != 255), fill, levels).astype(np.uint8)
    return levels

def region_spread(levels, values):
    out = np.zeros_like(values)
    for level_id in range(4):
        count, labels = cv2.connectedComponents((levels == level_id).astype(np.uint8), connectivity=4)
        n = np.maximum(np.bincount(labels.ravel(), minlength=count), 1)
        mean = np.bincount(labels.ravel(), values.ravel(), minlength=count) / n
        var = np.bincount(labels.ravel(), (values * values).ravel(), minlength=count) / n - mean * mean
        out = np.where(levels == level_id, np.sqrt(np.maximum(var, 0))[labels], out)
    return out.astype(np.float32)

def _reference_finish(image_rgb, screen_lines=200, white_point=0.8, black_point=0.3, light_tone=0.18, dark_tone=0.42, gradation=1.0, white_lines=0.4, halftone=True, antialias=0):
    luma = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    k = max(luma.shape[1] / 1024, 0.25)
    ink = ink_layer(luma, k)
    strokes = ink & ~(cv2.GaussianBlur(luma, (0, 0), 1.5 * k) < 0.22)
    values = value_map(luma, ink, k)
    black = min(float(black_point), float(white_point) - 0.02)
    levels = tone_plan(values, k, float(white_point), (float(white_point) + black) / 2, black)
    cover = np.take(np.float32((0.0, light_tone, dark_tone, 1.0)), levels)
    if gradation:
        smooth = cv2.GaussianBlur(values, (0, 0), 3 * k)
        amount = cv2.GaussianBlur(np.clip((region_spread(levels, smooth) - 0.03) / 0.05, 0, 1) * gradation, (0, 0), 4 * k)
        cover = cover * (1 - amount) + np.clip((white_point - smooth) / max(white_point - black, 0.001), 0, 1) * amount
    beta = cv2.erode((levels == 3).astype(np.uint8), np.ones((int(3 * k) | 1,) * 2, np.uint8)) > 0 if white_lines else None
    cuts = None
    if white_lines:
        _, labels, stats, _ = cv2.connectedComponentsWithStats(strokes.astype(np.uint8), connectivity=8)
        keep = np.maximum(stats[:, cv2.CC_STAT_WIDTH], stats[:, cv2.CC_STAT_HEIGHT]) >= 40 * k
        keep[0] = False
        cuts = cv2.erode(keep[labels].astype(np.uint8), np.ones((2 if k < 1.6 else 3,) * 2, np.uint8)) > 0
    if halftone:
        if antialias:
            screen = print_screen_tiled(cover, luma.shape[1] / screen_lines, antialias=antialias)
            ink_mask = ink | strokes
            if white_lines:
                ink_mask = (ink_mask | beta) & ~(beta & cuts)
                screen[beta & cuts] = 0
            edge = ink_mask.astype(np.float32)
            smooth = cv2.GaussianBlur(edge, (3, 3), .5)
            amount = .35 if antialias == 1 else .65
            edge = edge * (1-amount) + smooth * amount
            coverage = np.maximum(screen, edge)
            binary = ((screen > .5) | ink_mask).astype(np.float32)
            coverage = binary * (1-amount) + coverage * amount
            return np.round((1-coverage)*255).astype(np.uint8)
        page = print_screen_tiled(cover, luma.shape[1] / screen_lines) | ink | strokes
        if white_lines:
            page = (page | beta) & ~(beta & cuts)
        return np.where(~page, 255, 0).astype(np.uint8)
    page = np.clip((1 - cover) * 255, 0, 255).astype(np.uint8)
    if antialias:
        mask = ink | strokes
        if white_lines:
            mask = mask & ~(beta & cuts)
        strength = .35 if antialias == 1 else .65
        edge = mask.astype(np.float32)
        edge = edge*(1-strength) + cv2.GaussianBlur(edge,(3,3),.5)*strength
        page = np.round(page*(1-edge)).astype(np.uint8)
        if white_lines:
            page[beta & cuts] = 255
        return page
    page[ink | strokes] = 0
    if white_lines:
        page[beta & cuts] = 255
    return page
