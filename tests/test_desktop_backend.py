import importlib.util
import json
import os
from pathlib import Path
import sys


def test_packaged_config_keeps_secrets_and_data_outside_bundle(tmp_path, monkeypatch):
    entry = Path(__file__).resolve().parents[1] / 'scripts' / 'desktop_backend.py'
    spec = importlib.util.spec_from_file_location('desktop_entry', entry)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    bundle = tmp_path / 'bundle'
    bundle.mkdir()
    (bundle / 'desktop-config.json').write_text(json.dumps({
        'VILAB_SERVER_URL': 'http://192.168.1.143:9876',
        'VINOTE_SUPABASE_URL': 'https://example.supabase.co',
        'VINOTE_SUPABASE_PUBLISHABLE_KEY': 'sb_publishable_test',
    }))
    state = tmp_path / 'user data'
    monkeypatch.setattr(sys, '_MEIPASS', str(bundle), raising=False)
    monkeypatch.setenv('VINOTE_DESKTOP_DATA', str(state))
    monkeypatch.setenv('VILAB_SERVER_URL', 'http://127.0.0.1:9878')
    monkeypatch.chdir(tmp_path)
    # configure intentionally changes env; monkeypatch its whole mapping for cleanup.
    monkeypatch.setattr(os, 'environ', os.environ.copy())
    assert module.configure() == bundle
    first_secret = os.environ['MODEL_PROFILE_ENCRYPTION_KEY']
    module.configure()
    assert os.environ['MODEL_PROFILE_ENCRYPTION_KEY'] == first_secret
    assert os.environ['VILAB_SERVER_URL'] == 'http://192.168.1.143:9876'
    assert os.environ['DATABASE_URL'] == f'sqlite:///{(state / "vinote.db").as_posix()}'
    assert (state / 'desktop-secrets.json').exists()
    assert not (bundle / 'desktop-secrets.json').exists()
