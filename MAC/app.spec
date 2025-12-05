# -*- mode: python ; coding: utf-8 -*-

import os
import sys
from PyInstaller.utils.hooks import collect_submodules

# Paths
project_path = os.path.abspath(".")
templates_path = os.path.join(project_path, "templates")
static_path = os.path.join(project_path, "static")

# Hidden imports
hiddenimports = collect_submodules("flask")

# Data files
datas = [
    (templates_path, "templates"),
    (static_path, "static"),
]

block_cipher = None

a = Analysis(
    ["app.py"],
    pathex=[project_path],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# Icon: Windows uses .ico; macOS uses .icns
if sys.platform == "darwin":
    icon_path = os.path.join(project_path, "app_icon.icns")
else:
    icon_path = os.path.join(project_path, "app_icon.ico")

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="GermanFacilitiesMap",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    icon=icon_path,
)

# On macOS, produce a .app bundle (PyInstaller will ignore this on Windows)
if sys.platform == "darwin":
    app = BUNDLE(
        exe,
        name="GermanFacilitiesMap.app",
        icon=icon_path,
        bundle_identifier="ie.mercuryrising.germanfacilitiesmap",
    )
