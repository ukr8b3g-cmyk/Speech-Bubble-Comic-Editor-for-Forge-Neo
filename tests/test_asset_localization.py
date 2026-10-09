import json
from unittest.mock import patch

import pytest
from PIL import Image

from speech_bubble_forge import asset_catalog


@pytest.mark.parametrize('english', [
    {'displayNameEn': 'English name'},
    {'display_name_en': 'English name'},
    {'labelEn': 'English name'},
    {'label_en': 'English name'},
    {'labels': {'en': 'English name', 'ja': '動的素材'}},
])
def test_dynamic_catalog_preserves_bilingual_names_and_search(tmp_path, english):
    pack = tmp_path / 'pack'
    pack.mkdir()
    Image.new('RGBA', (8, 8)).save(pack / 'asset.png')
    entry = {
        'id': 'external', 'label': '日本語', 'displayName': '表示名',
        'ocrLabel': '画像の文字', 'asset': 'asset.png',
        'keywords': 'existing keyword', 'aliases': ['別名'], 'tags': ['tag'],
        **english,
    }
    (pack / 'manifest.json').write_text(json.dumps({'id': 'test', 'items': [entry]}), encoding='utf-8')
    asset_catalog.get_sfx_asset_catalog.cache_clear()
    try:
        with patch.object(asset_catalog, '_SFX_ASSET_ROOT', tmp_path):
            item = asset_catalog.get_sfx_asset_catalog()['items'][0]
            assert item['displayNameEn'] == 'English name'
            assert item['displayNameJa'] == english.get('labels', {}).get('ja', '')
            assert all(term in item['keywords'] for term in [
                '日本語', '表示名', '画像の文字', 'existing keyword', '別名', 'tag',
            ])
            assert item['id'] == entry['id']
    finally:
        asset_catalog.get_sfx_asset_catalog.cache_clear()
