"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
    path.join(__dirname, "..", "javascript", "speech_bubble_forge.js"),
    "utf8",
);
const placementSource = source.match(
    /function placeQuickPanel\(settings, details, anchor\) \{[\s\S]*?\n    \}/,
)?.[0];
assert.ok(placementSource, "placeQuickPanel must exist");
const placeQuickPanel = vm.runInNewContext(`(${placementSource})`);

class FakeElement {
    constructor(name) {
        this.name = name;
        this.parentElement = null;
        this.children = [];
        this.insertBeforeCalls = 0;
        this.appendChildCalls = 0;
        this.mutations = [];
        this.onclick = null;
        this.isConnected = true;
    }

    get nextElementSibling() {
        if (!this.parentElement) return null;
        const index = this.parentElement.children.indexOf(this);
        return index >= 0 ? this.parentElement.children[index + 1] || null : null;
    }

    _detach(node) {
        if (!node.parentElement) return;
        const parent = node.parentElement;
        const index = parent.children.indexOf(node);
        if (index >= 0) parent.children.splice(index, 1);
        parent.mutations.push({ removed: node, added: null });
        node.parentElement = null;
    }

    appendChild(node) {
        this.appendChildCalls += 1;
        this._detach(node);
        this.children.push(node);
        node.parentElement = this;
        this.mutations.push({ removed: null, added: node });
        return node;
    }

    insertBefore(node, anchor) {
        this.insertBeforeCalls += 1;
        assert.equal(anchor.parentElement, this, "anchor must belong to settings");
        this._detach(node);
        const index = this.children.indexOf(anchor);
        this.children.splice(index, 0, node);
        node.parentElement = this;
        this.mutations.push({ removed: null, added: node });
        return node;
    }

    click() {
        this.onclick?.({
            preventDefault() {},
            stopPropagation() {},
        });
    }
}

function attach(parent, ...nodes) {
    parent.children = [...nodes];
    for (const node of nodes) node.parentElement = parent;
}

{
    const settings = new FakeElement("settings");
    const details = new FakeElement("details");
    const anchor = new FakeElement("anchor");
    attach(settings, details, anchor);
    const original = details;
    for (let index = 0; index < 8; index += 1) placeQuickPanel(settings, details, anchor);
    assert.equal(details, original);
    assert.equal(details.parentElement, settings);
    assert.equal(details.nextElementSibling, anchor);
    assert.equal(settings.insertBeforeCalls, 0);
    assert.equal(settings.appendChildCalls, 0);
    assert.equal(settings.mutations.length, 0);
}

{
    const settings = new FakeElement("settings");
    const details = new FakeElement("details");
    const anchor = new FakeElement("anchor");
    attach(settings, anchor, details);
    placeQuickPanel(settings, details, anchor);
    assert.equal(details.nextElementSibling, anchor);
    assert.equal(settings.insertBeforeCalls, 1);
    const mutationsAfterMove = settings.mutations.length;
    placeQuickPanel(settings, details, anchor);
    assert.equal(settings.insertBeforeCalls, 1);
    assert.equal(settings.mutations.length, mutationsAfterMove);
}

{
    const settings = new FakeElement("settings");
    const details = new FakeElement("details");
    attach(settings, details);
    settings.isConnected = false;
    placeQuickPanel(settings, details, null);
    assert.equal(details.parentElement, settings);
    assert.equal(settings.insertBeforeCalls, 0);
    assert.equal(settings.appendChildCalls, 0);
    assert.equal(settings.mutations.length, 0);
}

{
    const settings = new FakeElement("settings");
    const details = new FakeElement("details");
    const anchor = new FakeElement("anchor");
    attach(settings, anchor);
    placeQuickPanel(settings, details, anchor);
    assert.equal(details.parentElement, settings);
    assert.equal(details.nextElementSibling, anchor);
    assert.equal(settings.insertBeforeCalls, 1);
    assert.equal(settings.appendChildCalls, 0);
}

{
    const settings = new FakeElement("settings");
    const details = new FakeElement("details");
    placeQuickPanel(settings, details, null);
    assert.equal(details.parentElement, settings);
    assert.equal(settings.insertBeforeCalls, 0);
    assert.equal(settings.appendChildCalls, 1);
}

function verifyPointerSequence(actionName) {
    const settings = new FakeElement("settings");
    const details = new FakeElement("details");
    const anchor = new FakeElement("anchor");
    const button = new FakeElement(actionName);
    attach(settings, details, anchor);
    attach(details, button);
    const detailsReference = details;
    const buttonReference = button;
    let clicks = 0;
    for (let index = 0; index < 8; index += 1) {
        button.onclick = () => { clicks += 1; };
        placeQuickPanel(settings, details, anchor);
    }
    assert.equal(details, detailsReference);
    assert.equal(button, buttonReference);
    assert.equal(details.parentElement, settings);
    assert.equal(settings.mutations.length, 0);
    button.click();
    assert.equal(clicks, 1);
}

verifyPointerSequence("gallery");
verifyPointerSequence("blank");

assert.match(placementSource, /details\.nextElementSibling === anchor/);
assert.doesNotMatch(placementSource, /isConnected/);
assert.match(source, /galleryAction\.onclick =/);
assert.match(source, /blankAction\.onclick =/);

console.log("quick_panel_dom_stability_test: OK");
