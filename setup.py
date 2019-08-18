from setuptools import setup, find_packages

setup(
    name='data_grid',
    version='0.1.0',
    author='Jan Burgy',
    author_email='jburgy@gmail.com',
    description='Dependency-free pivotable grid as Jupyter widget',
    url='https://github.com/jburgy/data-grid',
    packages=find_packages(),
    install_requires=[
        'ipywidgets',
        'jupyter_client',
        'notebook',
        'traitlets',
    ],
    package_data={
        '': ['*.js'],
    },
    data_files=[
        ('share/jupyter/nbextensions/data-grid', ['data_grid/main.js', 'data_grid/dataGrid.js']),
        ('etc/jupyter/nbconfig/notebook.d', ['jupyter-config/nbconfig/notebook.d/data-grid.json'])
    ],
    zip_safe=False,
)