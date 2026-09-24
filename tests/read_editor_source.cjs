"use strict";
const fs = require("node:fs");
const path = require("node:path");
module.exports = function readEditorSource(filename) {
  let html = fs.readFileSync(filename, "utf8");
  html = html.replace(/<script src="(\.\/project\/editor-shell\.js[^" ]*)"><\/script>/g,
    (tag, src) => tag + "\n<script>" + fs.readFileSync(path.resolve(path.dirname(filename), src.split("?")[0]), "utf8") + "</script>");
  return html.replace(/<link rel="stylesheet" href="(\.\/project\/editor-shell\.css[^" ]*)">/g,
    (tag, href) => tag + "\n<style>" + fs.readFileSync(path.resolve(path.dirname(filename), href.split("?")[0]), "utf8") + "</style>");
};
