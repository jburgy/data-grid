# Data Grid
```<data-grid>``` is a zero-dependency [web component](https://www.webcomponents.org/) written
in [es6](http://kangax.github.io/compat-table/es6/) to quickly explore large,
[narrow](https://en.wikipedia.org/wiki/Wide_and_narrow_data), datasets in your browser.

```<data-grid>``` started as a clean-room reimplementation of
[PivotTable.js](https://pivottablejs.org/examples/) to explore how
[Web SQL](https://www.w3.org/TR/webdatabase/) can lift is
[size limitations](https://github.com/nicolaskrutchen/pivottable/wiki/Frequently-Asked-Questions#input-data-size).
As a consequence, ```<data-grid>``` only works in browsers that
[support Web SQL](https://caniuse.com/#feat=sql-storage). Please read
[this article](https://nolanlawson.com/2014/04/26/web-sql-database-in-memoriam/) if you
have concerns over Web SQL sunsetting.

## Using Data Grid
### HTML5
```<data-grid>``` is entirely defined in a single javascript file which can be included in
a ```<script>``` tag. The script registers several custom elements (5 to be precise) but only
```<data-grid>``` is really useful
```html
<!DOCTYPE html>
<head>
    <script src="data_grid/dataGrid.js"></script>
</head>
<body>
    <data-grid data-name="myTable" data-db-name="myDatabase"></data-grid>
</body>
```

### Jupyter
```<data-grid>``` also ships as an
[automatically enabled nbextension](https://jupyter-notebook.readthedocs.io/en/stable/examples/Notebook/Distributing%20Jupyter%20Extensions%20as%20Python%20Packages.html#Automatically-enabling-a-server-extension-and-nbextension)
which implements an [ipywidget](https://ipywidgets.readthedocs.io/en/latest/).
```python
from data_grid import DataGridWidget
from pandas import read_csv
from urllib.request import urlopen
from IPython.display import display

dg = DataGridWidget('ibrd_balance_sheet', db='myDb')

url = 'https://pythonhosted.org/cubes/_downloads/IBRD_Balance_Sheet__FY2010.csv'
with url_open(url) as buffer:  # you might need to install a ProxyHandler
    df = read_csv(buffer)
df.rename(columns={'Amount (US$, Millions)': 'Value'}, inplace=True)

with dg.connect() as conn:
    df.to_sql(dg.table, conn, if_exists='replace', index=False)

display(dg)
```
```DataGridWidget``` implements two-way binding with ```<data-grid>```. You can set ```.col_axis```
or ```.row_axis``` in a separate cell and watch the output respond asynchronously.