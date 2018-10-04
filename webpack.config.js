var path = require('path');
var webpack = require('webpack');
var vtkRules = require('vtk.js/Utilities/config/dependency.js').webpack.v2.rules;

const autoprefixer = require('autoprefixer');

var entry = path.join(__dirname, './src/index.js');
const sourcePath = path.join(__dirname, './src');
const outputPath = path.join(__dirname, './dist');

module.exports = {
    mode: 'development',
    entry,
    output: {
        path: outputPath,
        filename: 'MyWebApp.js',
    },
    module: {
        rules: [
            {
                test: entry,
                loader: "expose-loader?MyWebApp"
            },
            {
                test: /\.html$/,
                loader: 'html-loader'
            },
            {
                test: /\.(png|jpg)$/,
                use: 'url-loader?limit=81920'
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader', 'postcss-loader']
            },
            {
                test: /\.mcss$/,
                use: [
                    {
                        loader: 'style-loader'
                    },
                    {
                        loader: 'css-loader',
                        options: {
                            localIdentName: '[name]-[local]_[sha512:hash:base32:5]',
                            modules: true,
                        },
          },
                    {
                        loader: 'postcss-loader',
                        options: {
                            plugins: () => [autoprefixer('last 2 version', 'ie >= 10')],
                        },
          },
        ],
      },
    ].concat(vtkRules),
    },
    resolve: {
        modules: [
      path.resolve(__dirname, 'node_modules'),
      sourcePath,
    ],
    },
};
