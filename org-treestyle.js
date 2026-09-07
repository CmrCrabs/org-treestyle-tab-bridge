const TST_ID = "treestyletab@piro.sakura.ne.jp";

async function registerToTST() {
    try {
        const result = await browser.runtime.sendMessage(TST_ID, {
            type: "register-self",
            name: browser.i18n.getMessage("org-treestyle-tab-bridge"),
            icons: browser.runtime.getManifest().icons,
            listeningTypes: [
                "wait-for-shutdown",
                "ready",
                "permissions-changed",

                "tree-attached",
                "tree-detached",
                "new-tab-processed",
                "tab-rendered",
                "tab-unrendered",
            ],
            allowBulkMessaging: true,
            style: ` `,
            permissions: ["tabs"],
        });
        console.log("Registered to TST");
    } catch (e) {
        console.log(e);
    }
}

async function waitForTSTShutdown() {
    try {
        await browser.runtime.sendMessage(TST_ID, {
            type: "wait-for-shutdown",
        });
    } catch (e) {
        if (e.message.startsWith("Could not establish connection. Receiving end does not exist.")) {
            return true;
        }
        if (e.message.startsWith("Message manager disconnected")) {
            return true;
        }
        throw e;
    }
}

async function getTabTree() {
    let raw_tree = await browser.runtime.sendMessage(TST_ID, {
        type: "get-tree",
        window: 0,
        tabs: "*",
    });

    return raw_tree.map((t) => ({
        id: t.id,
        indent: t.indent,
        index: t.index,
        pinned: t.pinned,
        url: t.url,
        title: t.title,
    }));
}

function generateOrg(tabs) {
    return tabs
        .map((t) => `${"*".repeat(t.indent + 1)} ${t.pinned ? "PINNED " : ""}[[${t.url}][${t.title}]]`)
        .join("\n");
}

async function readEmacs() {
    let response = await fetch("http://localhost:8080/org-treestyle/read");
    return await response.text();
}

async function writeEmacs(body) {
    let response = await fetch("http://localhost:8080/org-treestyle/write", {
        method: "POST",
        headers: {
            "Content-Type": "text/plain",
        },
        body: body,
    })
        .then((r) => r.text())
        .then((body) => console.log("response:", body))
        .catch((e) => console.error("error:", e));
}

function debounce(callback, wait) {
    let timeoutId = null;
    return (...args) => {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
            callback(...args);
        }, wait);
    };
}

async function updateLocalState() {
    let tabs = await getTabTree();
    let org = generateOrg(tabs);
    await writeEmacs(org);
}

async function onMessageExternal(message, sender) {
    if (sender.id == TST_ID) {
        if (message && message.messages) {
            for (const oneMessage of message.messages) {
                onMessageExternal(oneMessage, sender);
            }
        }
        switch (message && message.type) {
            case "permissions-changed":
                registerToTST();
                break;
            case "wait-for-shutdown":
                return new Promise(() => {
                    window.addEventListener("beforeunload", () => resolve(true));
                });
                break;
            case "ready":

            case "tree-attached":
            case "tree-detached":
            case "new-tab-processed":
                debounce(updateLocalState, 3000);
                break;
        }
    }
}

registerToTST();
browser.runtime.onMessageExternal.addListener(onMessageExternal);
browser.tabs.onRemoved.addListener(debounce(updateLocalState, 3000));
browser.tabs.onUpdated.addListener(debounce(updateLocalState, 3000), { properties: ["status", "pinned"] });
