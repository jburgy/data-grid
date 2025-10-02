from ipywidgets import DOMWidget
from traitlets import Unicode, List


class DataGridWidget(DOMWidget):
    _view_name = Unicode("DataGridView").tag(sync=True)
    _view_module = Unicode("nbextensions/data-grid/main").tag(sync=True)
    _view_module_version = Unicode("0.1.0").tag(sync=True)
    table = Unicode().tag(sync=True)
    unused_axis = List(Unicode()).tag(sync=True)
    col_axis = List(Unicode()).tag(sync=True)
    row_axis = List(Unicode()).tag(sync=True)

    def __init__(self, table: str, db: str):
        super().__init__()
        self.table = table
        self.db = db


def _jupyter_labextension_paths():
    return [{"src": "labextension", "dest": "data-grid"}]


__all__ = ["DataGridWidget", "_jupyter_labextension_paths"]
