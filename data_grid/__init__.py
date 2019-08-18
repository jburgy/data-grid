from ipywidgets import DOMWidget
from json import load
from jupyter_client import find_connection_file
from notebook.notebookapp import list_running_servers
from os import getppid
from os.path import expandvars
from pathlib import Path
from platform import system
from sqlite3 import connect
from traitlets import Unicode, List
from urllib.request import urlopen


server_info = next(info for info in list_running_servers() if info['pid'] == getppid())
origin = server_info['url'].translate(str.maketrans(':', '_', '/'))
root = Path(expandvars('%LocalAppData%'), 'Google', 'Chrome', 'User Data', 'Default', 'databases') if system() == 'Windows' \
    else Path('~', 'Library', 'Application Support', 'Google', 'Chrome', 'Profile 1', 'databases').expanduser()


def database_name():
    sessions = load(urlopen(f"{server_info['url']}api/sessions?token={server_info['token']}"))
    connection_file = find_connection_file()
    session = next(session for session in sessions if session['kernel']['id'] in connection_file)
    with connect(str(root.joinpath('Databases.db'))) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT name FROM Databases WHERE origin = :origin AND description = :description',
                       dict(origin=origin, description=session['path']))
        result = cursor.fetchone()
        if not result:
            # There is no web sql database associated with this notebook name so let's create one
            # using the session guid. This raises a sqlite3.IntegrityError if you try to insert a
            # second table within the same session (UNIQUE constraint failed)
            cursor.execute('''INSERT INTO Databases (origin, name, description, estimated_size)
VALUES (:origin, :name, :description, :estimated_size)''',
                           dict(origin=origin, name=session['id'], estimated_size=1024*1024,
                                description=session['path']))
            result = session['id'],
    return result[0]


class DataGridWidget(DOMWidget):
    _view_name = Unicode('DataGridView').tag(sync=True)
    _view_module = Unicode('nbextensions/data-grid/main').tag(sync=True)
    _view_module_version = Unicode('0.1.0').tag(sync=True)
    table = Unicode().tag(sync=True)
    unused_axis = List(Unicode()).tag(sync=True)
    col_axis = List(Unicode()).tag(sync=True)
    row_axis = List(Unicode()).tag(sync=True)

    def connect(self, **kwargs):
        """See DatabasesTable::GetDatabaseID

        https://cs.chromium.org/chromium/src/storage/browser/database/databases_table.cc?sq=package:chromium&dr=CSs&l=44
        """
        origin_ = kwargs.get('origin', origin)
        db = kwargs.get('db', self.db)
        with connect(str(root.joinpath('Databases.db'))) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT id FROM Databases WHERE origin = :origin AND name = :name',
                           dict(origin=origin_, name=db))
            result, = cursor.fetchone()
        return connect(str(root.joinpath(origin_, str(result))))
    
    def __init__(self, table, db=None):
        super().__init__()
        self.table = table
        self.db = db or database_name()


def _jupyter_nbextension_paths():
    return [
        dict(section='notebook', src='.', dest='data-grid', require='data-grid/main')
    ]


__all__ = ['DataGridWidget', '_jupyter_nbextension_paths']