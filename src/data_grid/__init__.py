import os
from pathlib import Path

from anywidget import AnyWidget
from traitlets import List, Unicode

_STATIC = Path(__file__).parent / "static"

if os.environ.get("DATA_GRID_DEV"):  # served by `npx vite`
    _ESM = "http://localhost:5173/js/widget.mjs?anywidget"
    _CSS = ""
else:  # emitted by `npx vite build`
    # Paths (rather than inlined text) let anywidget serve the lazily imported
    # sqlite-wasm chunks that sit next to widget.mjs.
    _ESM = _STATIC / "widget.mjs"
    _CSS = _STATIC / "widget.css"
    if not _CSS.exists():  # vite omits the stylesheet while widget.css is empty
        _CSS = ""


class DataGridWidget(AnyWidget):
    _esm = _ESM
    _css = _CSS
    table = Unicode().tag(sync=True)
    db = Unicode().tag(sync=True)
    source = Unicode().tag(sync=True)
    unused_axis = List(Unicode()).tag(sync=True)
    col_axis = List(Unicode()).tag(sync=True)
    row_axis = List(Unicode()).tag(sync=True)

    def __init__(self, table: str, db: str, source: str = "", **kwargs):
        super().__init__(table=table, db=db, source=source, **kwargs)
