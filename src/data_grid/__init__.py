from pathlib import Path

from anywidget import AnyWidget
from traitlets import Unicode, List


_DEV = True # switch to False for production

if _DEV:
    # from `npx vite`
    ESM = "http://localhost:5173/js/widget.js?anywidget"
    CSS = ""
else:
    # from `npx vite build`
    bundler_output_dir = Path(__file__).parent / "static"
    ESM = (bundler_output_dir / "widget.js").read_text()
    CSS = (bundler_output_dir / "widget.css").read_text()


class DataGridWidget(AnyWidget):
    _esm = ESM
    _css = CSS
    table = Unicode().tag(sync=True)
    db = Unicode().tag(sync=True)
    source = Unicode().tag(sync=True)
    unused_axis = List(Unicode()).tag(sync=True)
    col_axis = List(Unicode()).tag(sync=True)
    row_axis = List(Unicode()).tag(sync=True)

    def __init__(self, table: str, db: str, source: str = ""):
        super().__init__()
        self.table = table
        self.db = db
        self.source = source
