# Data Grid
```<data-grid>``` is a [web component](https://www.webcomponents.org/) written
in [es6](http://kangax.github.io/compat-table/es6/) to quickly explore **large**,
[narrow](https://en.wikipedia.org/wiki/Wide_and_narrow_data#Narrow), datasets in your browser.

```<data-grid>``` started as a clean-room reimplementation of
[PivotTable.js](https://pivottablejs.org/examples/) to explore how
[Web SQL](https://www.w3.org/TR/webdatabase/) could lift its
[size limitations](https://github.com/nicolaskruchten/pivottable/wiki/Frequently-Asked-Questions#input-data-size).
Unfortunately, Web SQL was [deprecated](https://developer.chrome.com/blog/deprecating-web-sql)
so ```<data-grid>``` now depends on [`@sqlite.org/sqlite-wasm`](http://sqlite.org/wasm)
thanks to the magic of [WebAssembly](https://webassembly.org/).

## Using Data Grid
### HTML5
```<data-grid>``` consists of a single
[javascript module](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules).
The module registers several custom elements (5 to be precise) but only
```<data-grid>``` is really useful
```html
<!DOCTYPE html>
<head>
    <script type="module" src="js/dataGrid.js"></script>
</head>
<body>
    <data-grid data-name="myTable" data-db-name="myDatabase"></data-grid>
</body>
```

### Jupyter
```<data-grid>``` also ships as an [anyywidget](https://anywidget.dev/).
```python
from data_grid import DataGridWidget

# assume you have a sqlite database called examples/example.db
DataGridWidget(table="fines", db="example", source="/api/contents/examples/example.db")
```
```DataGridWidget``` implements two-way binding with ```<data-grid>```. You can set ```.col_axis```
or ```.row_axis``` in a separate cell and watch the output respond asynchronously.

Testing `DataGridWidget` is unfortunately finicky because of
[CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) restrictions.
One approach is to run [`jupyter lab`](https://jupyter.org/try#jupyterlab)
and [Vite](https://vite.dev) side-by-side and leverage Vite's
[`server.proxy`](https://vite.dev/config/server-options.html#server-proxy) to
route most request to jupyter.  This requires editing `jupyter_lab_config.py`:
```python
## Set the Access-Control-Allow-Origin header
#  
#          Use '*' to allow any origin to access your server.
#  
#          Takes precedence over allow_origin_pat.
#  Default: ''
c.ServerApp.allow_origin = 'http://localhost:5173'

## Supply overrides for the tornado.web.Application that the Jupyter server uses.
#  Default: {}
c.ServerApp.tornado_settings = {
    'headers': {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
    }
}
```