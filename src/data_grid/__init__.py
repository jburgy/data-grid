from pathlib import Path

from anywidget import AnyWidget
from traitlets import Unicode, List


bundler_output_dir = Path(__file__).parent / "static"

class DataGridWidget(AnyWidget):
    _esm = bundler_output_dir / "widget.js"
    _css = bundler_output_dir / "widget.css"
    table = Unicode().tag(sync=True)
    unused_axis = List(Unicode()).tag(sync=True)
    col_axis = List(Unicode()).tag(sync=True)
    row_axis = List(Unicode()).tag(sync=True)

    def __init__(self, table: str, db: str):
        super().__init__()
        self.table = table
        self.db = db
