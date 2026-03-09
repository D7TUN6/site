import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import webpack from "webpack";
import CompressionPlugin from "compression-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import CssMinimizerPlugin from "css-minimizer-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import { VueLoaderPlugin } from "vue-loader";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, "dist");
const PUBLIC_DIR = path.resolve(__dirname, "public");
const ENTRY_FILE = path.resolve(__dirname, "src", "main.ts");
const HTML_TEMPLATE = path.resolve(__dirname, "index.html");
const PRECOMPRESS_RE = /\.(?:js|css|html|json|svg|txt|xml|map|woff2?|ico)$/i;

export default (_env, argv) => {
  const isProd = argv.mode === "production";

  return {
    mode: isProd ? "production" : "development",
    entry: ENTRY_FILE,
    output: {
      path: DIST_DIR,
      publicPath: "/",
      clean: true,
      filename: isProd ? "assets/[name].[contenthash:8].js" : "assets/[name].js",
      chunkFilename: isProd ? "assets/[name].[contenthash:8].js" : "assets/[name].js",
      assetModuleFilename: isProd ? "assets/media/[name].[contenthash:8][ext]" : "assets/media/[name][ext]"
    },
    devtool: isProd ? false : "eval-cheap-module-source-map",
    cache: {
      type: "filesystem"
    },
    performance: {
      hints: false
    },
    resolve: {
      extensions: [".ts", ".js", ".vue", ".json"],
      alias: {
        "@": path.resolve(__dirname, "src")
      }
    },
    module: {
      rules: [
        {
          test: /\.vue$/i,
          loader: "vue-loader"
        },
        {
          test: /\.ts$/i,
          exclude: /node_modules/,
          loader: "ts-loader",
          options: {
            appendTsSuffixTo: [/\.vue$/],
            transpileOnly: true
          }
        },
        {
          test: /\.css$/i,
          use: [
            isProd ? MiniCssExtractPlugin.loader : "style-loader",
            {
              loader: "css-loader",
              options: {
                url: false,
                sourceMap: !isProd
              }
            }
          ]
        },
        {
          test: /\.mdx$/i,
          type: "asset/source"
        },
        {
          test: /\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot)$/i,
          type: "asset/resource"
        }
      ]
    },
    plugins: [
      new VueLoaderPlugin(),
      new HtmlWebpackPlugin({
        template: HTML_TEMPLATE,
        inject: "body",
        scriptLoading: "defer"
      }),
      new webpack.DefinePlugin({
        __VUE_OPTIONS_API__: JSON.stringify(false),
        __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false)
      }),
      ...(isProd
        ? [
            new MiniCssExtractPlugin({
              filename: "assets/[name].[contenthash:8].css",
              chunkFilename: "assets/[name].[contenthash:8].css"
            }),
            new CopyPlugin({
              patterns: [
                {
                  from: PUBLIC_DIR,
                  to: DIST_DIR,
                  noErrorOnMissing: true
                }
              ]
            }),
            new CompressionPlugin({
              algorithm: "brotliCompress",
              compressionOptions: {
                params: {
                  [zlib.constants.BROTLI_PARAM_QUALITY]: 11
                }
              },
              filename: "[path][base].br",
              test: PRECOMPRESS_RE,
              deleteOriginalAssets: false
            }),
            new CompressionPlugin({
              algorithm: "gzip",
              filename: "[path][base].gz",
              test: PRECOMPRESS_RE,
              deleteOriginalAssets: false
            })
          ]
        : [])
    ],
    optimization: isProd
      ? {
          splitChunks: {
            chunks: "all"
          },
          runtimeChunk: "single",
          minimizer: ["...", new CssMinimizerPlugin()]
        }
      : undefined,
    devServer: isProd
      ? undefined
      : {
          host: "127.0.0.1",
          port: 3001,
          hot: true,
          historyApiFallback: true,
          static: {
            directory: PUBLIC_DIR,
            publicPath: "/",
            watch: true
          },
          proxy: [
            {
              context: ["/api"],
              target: "http://127.0.0.1:3002",
              changeOrigin: true
            }
          ]
        }
  };
};
