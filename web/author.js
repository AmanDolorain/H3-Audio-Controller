import { app } from "../../scripts/app.js";

const installed = Symbol("h3AudioControllerFooter");
const states = new Set();
let observer;
let scheduled = false;

function makeCredit() {
    const label = document.createElement("span");
    label.className = "h3-audio-controller-author-credit";
    label.textContent = "♪ Aman Dolorain";
    label.title = "H3 Audio Controller — ♪ Aman Dolorain";
    Object.assign(label.style, {
        marginLeft: "0",
        flex: "0 0 auto",
        alignSelf: "center",
        font: '400 14px/20px Arial, sans-serif',
        letterSpacing: "normal",
        color: "#ffffff",
        opacity: "1",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        userSelect: "none",
        padding: "0",
    });
    return label;
}

function clearMount(state) {
    state.label?.remove();
    state.ownRow?.remove();
    state.label = state.ownRow = state.root = null;
}

function syncCredits() {
    scheduled = false;
    const activeGraph = app.canvas?.graph;
    const roots = [...document.querySelectorAll(".lg-node[data-node-id]")];
    for (const state of states) {
        const { node } = state;
        const root = node.graph === activeGraph && !node.flags?.collapsed
            ? roots.find((element) => element.dataset.nodeId === String(node.id))
            : null;
        if (!root || root.dataset.collapsed) {
            if (state.root) clearMount(state);
            continue;
        }
        if (state.root && state.root !== root) clearMount(state);
        const body = [...root.querySelectorAll("[data-testid]")].find(
            (element) => element.dataset.testid === `node-body-${node.id}`,
        );
        if (!body) continue;
        if (body.style.paddingBottom !== "30px") body.style.paddingBottom = "30px";
        // NodeBadges.vue renders a direct .mt-auto flex row in the Vue node body.
        // Reuse the footer row and remove only this package's old badge.
        let row = [...body.children].find(
            (element) => element.classList.contains("mt-auto") && element !== state.ownRow,
        );
        // Registry badges use the package display name or normalized repository name.
        // Match only this package; retain badges belonging to other extensions.
        const packageNames = new Set(["h3audiocontroller", "loadaudiocontroller"]);
        for (const element of (row ? row.querySelectorAll("*") : body.querySelectorAll('[class*="badge"], [class*="Badge"]'))) {
            if (element.closest(".h3-audio-controller-credit-row")) continue;
            const key = element.textContent.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
            if (packageNames.has(key) && element.style.display !== "none") {
                element.style.display = "none";
            }
        }
        if (!state.ownRow?.isConnected) {
            const footer = document.createElement("div");
            footer.className = "h3-audio-controller-credit-row";
            Object.assign(footer.style, {
                display: "flex", alignItems: "center", justifyContent: "flex-start",
                boxSizing: "border-box", minHeight: "30px", flexShrink: "0",
                margin: "0", padding: "5px 14px",
                position: "absolute", left: "0", right: "0", bottom: "0",
                height: "30px", zIndex: "1", borderRadius: "0 0 10px 10px",
                
            });
            root.append(footer);
            state.ownRow = footer;
        }
        row = state.ownRow;
        // node.color is the title-bar color; bgcolor is the body color.
        // Anchor inside the positioned node, never after its body in document flow.
        const header = root.querySelector('[data-testid="node-header"], .lg-node-header, .node-header');
        let color = node.color;
        if (!color && header) {
            const bg = getComputedStyle(header).backgroundColor;
            if (bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") color = bg;
        }
        color ||= globalThis.LiteGraph?.NODE_DEFAULT_COLOR || "#2e3440";
        if (row.dataset.headerColor !== color) {
            row.style.backgroundColor = color;
            row.dataset.headerColor = color;
        }
        if (!state.label) state.label = makeCredit();
        if (state.label.parentElement !== row) row.append(state.label);
        // Use the actual title text metrics, including its inset after the chevron.
        const titleText = [...root.querySelectorAll("*")].find(el =>
            !row.contains(el) && el.children.length === 0 &&
            [node.title, "H3 Audio Controller"].includes(el.textContent.trim())
        );
        if (titleText) {
            const font = getComputedStyle(titleText);
            for (const key of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing"]) {
                if (state.label.style[key] !== font[key]) state.label.style[key] = font[key];
            }
            const rootRect = root.getBoundingClientRect();
            const titleRect = titleText.getBoundingClientRect();
            const scale = root.offsetWidth ? rootRect.width / root.offsetWidth : 1;
            const inset = Math.max(0, (titleRect.left - rootRect.left) / (scale || 1));
            const padding = `${inset}px`;
            if (row.style.paddingLeft !== padding) row.style.paddingLeft = padding;
        } else {
            row.style.paddingLeft = "34px";
        }
        state.root = root;
    }
}

function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(syncCredits);
}

function observeNodes() {
    if (observer) return;
    observer = new MutationObserver(records => {
        if (records.some(record => !record.target.closest?.(".h3-audio-controller-credit-row"))) scheduleSync();
    });
    observer.observe(document.body, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ["data-collapsed", "data-node-id", "class", "style"],
    });
}

app.registerExtension({
    name: "H3AudioController.AuthorCredit",
    setup() { observeNodes(); scheduleSync(); },
    nodeCreated(node) {
        if (node.comfyClass !== "H3AudioController" || node[installed]) return;
        node[installed] = true;
        const state = { node, label: null, ownRow: null, root: null };
        states.add(state);

        // Classic canvas fallback. Vue nodes use the DOM footer above instead.
        const previousComputeSize = node.computeSize;
        node.computeSize = function (...args) {
            const size = previousComputeSize.apply(this, args);
            return [Math.max(size[0], 480), Math.max(size[1] + 30, 500)];
        };
        const previousDraw = node.onDrawForeground;
        node.onDrawForeground = function (ctx, ...args) {
            const result = previousDraw?.call(this, ctx, ...args);
            if (state.root?.isConnected && state.ownRow?.dataset.headerColor !== this.color) scheduleSync();
            if (this.flags?.collapsed || state.root?.isConnected) return result;
            ctx.save();
            try {
                ctx.fillStyle = this.color || globalThis.LiteGraph?.NODE_DEFAULT_COLOR || "#2e3440";
                ctx.beginPath();
                ctx.roundRect(0, this.size[1] - 30, this.size[0], 30, [0, 0, 10, 10]);
                ctx.fill();
                ctx.font = `${globalThis.LiteGraph?.NODE_TEXT_SIZE || 14}px Arial`;
                ctx.fillStyle = "#ffffff";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText("♪ Aman Dolorain", 34, this.size[1] - 15);
            } finally { ctx.restore(); }
            return result;
        };
        const previousRemoved = node.onRemoved;
        node.onRemoved = function (...args) {
            states.delete(state);
            clearMount(state);
            return previousRemoved?.apply(this, args);
        };
        const minimum = node.computeSize();
        node.setSize([Math.max(node.size[0], minimum[0]), Math.max(node.size[1], minimum[1])]);
        observeNodes();
        scheduleSync();
        node.setDirtyCanvas?.(true, true);
    },
});
