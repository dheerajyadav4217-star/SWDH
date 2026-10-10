/*
  SWDH / LINKLESS — FRONTEND CONTROLLER

  Works with the current index.html and style.css.
  Current backend supports POST /register.
  Pairing, device listing, messaging and file sharing require their
  corresponding backend API routes to be implemented before they can work.
*/

"use strict";

(() => {
    const API_BASE = window.SWDH_API_BASE || window.location.origin;
    const STORAGE_KEYS = {
        deviceId: "deviceId",
        deviceName: "deviceName"
    };

    const $ = (selector) => document.querySelector(selector);

    const elements = {
        setupScreen: $("#setupScreen"),
        setupForm: $("#setupForm"),
        deviceName: $("#deviceName"),
        setupMessage: $("#setupMessage"),
        continueBtn: $("#continueBtn"),
        dashboard: $("#dashboard"),
        welcomeMessage: $("#welcomeMessage"),
        connectionStatus: $("#connectionStatus"),
        connectionStatusText: $("#connectionStatusText"),
        devicesList: $("#devicesList"),
        emptyDevicesState: $("#emptyDevicesState"),
        refreshDevicesBtn: $("#refreshDevicesBtn"),
        newPairingBtn: $("#newPairingBtn"),
        emptyPairDeviceBtn: $("#emptyPairDeviceBtn"),
        communicationPanel: $("#communicationPanel"),
        activeDeviceLabel: $("#activeDeviceLabel"),
        chatStatus: $("#chatStatus"),
        messageList: $("#messageList"),
        emptyMessagesState: $("#emptyMessagesState"),
        messageForm: $("#messageForm"),
        messageInput: $("#messageInput"),
        sendMessageBtn: $("#sendMessageBtn"),
        fileUploadForm: $("#fileUploadForm"),
        fileInput: $("#fileInput"),
        selectedFiles: $("#selectedFiles"),
        uploadFilesBtn: $("#uploadFilesBtn"),
        clearFilesBtn: $("#clearFilesBtn"),
        sharedFilesList: $("#sharedFilesList"),
        fileDropArea: $("#fileDropArea"),
        pairingModal: $("#pairingModal"),
        generateCodeTab: $("#generateCodeTab"),
        enterCodeTab: $("#enterCodeTab"),
        generateCodePanel: $("#generateCodePanel"),
        enterCodePanel: $("#enterCodePanel"),
        generatePairingCodeBtn: $("#generatePairingCodeBtn"),
        generatedCodeContainer: $("#generatedCodeContainer"),
        generatedPairingCode: $("#generatedPairingCode"),
        copyPairingCodeBtn: $("#copyPairingCodeBtn"),
        pairingExpiry: $("#pairingExpiry"),
        pairingCodeMessage: $("#pairingCodeMessage"),
        enterPairingCodeForm: $("#enterPairingCodeForm"),
        pairingCodeInput: $("#pairingCodeInput"),
        enterPairingMessage: $("#enterPairingMessage"),
        confirmPairingBtn: $("#confirmPairingBtn"),
        profileBtn: $("#profileBtn"),
        profileModal: $("#profileModal"),
        profileDeviceName: $("#profileDeviceName"),
        profileDeviceId: $("#profileDeviceId"),
        renameDeviceForm: $("#renameDeviceForm"),
        renameDeviceInput: $("#renameDeviceInput"),
        saveDeviceNameBtn: $("#saveDeviceNameBtn"),
        logoutBtn: $("#logoutBtn"),
        profileMessage: $("#profileMessage"),
        aboutBtn: $("#aboutBtn"),
        helpBtn: $("#helpBtn"),
        aboutModal: $("#aboutModal"),
        helpModal: $("#helpModal"),
        logoLink: $("#logoLink"),
        toastContainer: $("#toastContainer")
    };

    const state = {
        deviceId: localStorage.getItem(STORAGE_KEYS.deviceId),
        deviceName: localStorage.getItem(STORAGE_KEYS.deviceName),
        activeDeviceId: null,
        selectedFiles: [],
        pairingExpiryTimer: null,
        pairingExpiresAt: null
    };

    function showMessage(element, message, type = "") {
        if (!element) return;
        element.textContent = message;
        element.classList.remove("message-success", "message-error");
        if (type === "success") element.classList.add("message-success");
        if (type === "error") element.classList.add("message-error");
    }

    function toast(message, type = "") {
        if (!elements.toastContainer) {
            console.log(message);
            return;
        }

        const item = document.createElement("div");
        item.className = `toast${type ? ` is-${type}` : ""}`;
        item.textContent = message;
        elements.toastContainer.appendChild(item);

        window.setTimeout(() => item.remove(), 4000);
    }

    async function apiRequest(path, options = {}) {
        const headers = new Headers(options.headers || {});
        const requestOptions = { ...options, headers };

        if (state.deviceId) {
            headers.set("X-Device-Id", state.deviceId);
        }

        if (options.body && !(options.body instanceof FormData) &&
            typeof options.body !== "string") {
            headers.set("Content-Type", "application/json");
            requestOptions.body = JSON.stringify(options.body);
        }

        let response;
        try {
            response = await fetch(`${API_BASE}${path}`, requestOptions);
        } catch (error) {
            throw new Error(
                "Server se connection nahi ho paaya. Check karo ki backend port 3000 par chal raha hai."
            );
        }

        const contentType = response.headers.get("content-type") || "";
        const result = contentType.includes("application/json")
            ? await response.json()
            : await response.text();

        if (!response.ok) {
            const message = result && typeof result === "object" && result.message
                ? result.message
                : `Request failed (${response.status})`;
            throw new Error(message);
        }

        return result;
    }

    function setConnectionStatus(status, message) {
        if (!elements.connectionStatus) return;
        elements.connectionStatus.classList.remove(
            "is-connected",
            "is-disconnected"
        );

        if (status === "connected") {
            elements.connectionStatus.classList.add("is-connected");
        } else if (status === "disconnected") {
            elements.connectionStatus.classList.add("is-disconnected");
        }

        if (elements.connectionStatusText) {
            elements.connectionStatusText.textContent = message;
        }
    }

    function showSetup() {
        if (elements.setupScreen) elements.setupScreen.hidden = false;
        if (elements.dashboard) elements.dashboard.hidden = true;
        if (elements.profileBtn) elements.profileBtn.hidden = true;

        if (elements.deviceName && state.deviceName) {
            elements.deviceName.value = state.deviceName;
        }
    }

    function showDashboard() {
        if (elements.setupScreen) elements.setupScreen.hidden = true;
        if (elements.dashboard) elements.dashboard.hidden = false;
        if (elements.profileBtn) elements.profileBtn.hidden = false;

        if (elements.welcomeMessage) {
            elements.welcomeMessage.textContent =
                `Welcome back, ${state.deviceName || "there"}. Manage your connected devices.`;
        }

        updateProfileDetails();
        setConnectionStatus("disconnected", "Checking server connection...");
        checkServer();
        loadDevices();
    }

    async function checkServer() {
        try {
            await apiRequest("/");
            setConnectionStatus("connected", "Server is reachable");
        } catch (error) {
            setConnectionStatus("disconnected", "Server is offline");
        }
    }

    async function registerDevice(event) {
        event.preventDefault();

        const name = elements.deviceName?.value.trim() || "";
        if (!name) {
            showMessage(elements.setupMessage, "Please enter your device name.", "error");
            elements.deviceName?.focus();
            return;
        }

        if (name.length > 40) {
            showMessage(elements.setupMessage, "Device name must be 40 characters or fewer.", "error");
            return;
        }

        const previousLabel = elements.continueBtn?.textContent;
        if (elements.continueBtn) {
            elements.continueBtn.disabled = true;
            elements.continueBtn.textContent = "Connecting...";
        }

        showMessage(elements.setupMessage, "Registering your device...");

        const deviceId = state.deviceId || (
            window.crypto && typeof window.crypto.randomUUID === "function"
                ? window.crypto.randomUUID()
                : `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
        );

        try {
            const result = await apiRequest("/register", {
                method: "POST",
                body: {
                    deviceName: name,
                    deviceId
                }
            });

            state.deviceId = deviceId;
            state.deviceName = name;
            localStorage.setItem(STORAGE_KEYS.deviceId, deviceId);
            localStorage.setItem(STORAGE_KEYS.deviceName, name);

            showMessage(
                elements.setupMessage,
                (result && result.message) || "Device registered successfully!",
                "success"
            );

            showDashboard();
        } catch (error) {
            showMessage(elements.setupMessage, error.message, "error");
            toast(error.message, "error");
        } finally {
            if (elements.continueBtn) {
                elements.continueBtn.disabled = false;
                elements.continueBtn.textContent = previousLabel || "Continue";
            }
        }
    }

    function updateProfileDetails() {
        if (elements.profileDeviceName) {
            elements.profileDeviceName.textContent = state.deviceName || "—";
        }
        if (elements.profileDeviceId) {
            elements.profileDeviceId.textContent = state.deviceId || "Not registered";
        }
        if (elements.renameDeviceInput) {
            elements.renameDeviceInput.value = state.deviceName || "";
        }
    }

    function openModal(dialog) {
        if (!dialog) return;
        if (typeof dialog.showModal === "function") {
            if (!dialog.open) dialog.showModal();
        } else {
            dialog.setAttribute("open", "");
        }
    }

    function closeModal(dialog) {
        if (!dialog) return;
        if (typeof dialog.close === "function" && dialog.open) {
            dialog.close();
        } else {
            dialog.removeAttribute("open");
        }
    }

    function setPairingTab(tab) {
        const generate = tab === "generate";

        elements.generateCodeTab?.classList.toggle("active", generate);
        elements.enterCodeTab?.classList.toggle("active", !generate);

        elements.generateCodeTab?.setAttribute("aria-selected", String(generate));
        elements.enterCodeTab?.setAttribute("aria-selected", String(!generate));

        if (elements.generateCodePanel) elements.generateCodePanel.hidden = !generate;
        if (elements.enterCodePanel) elements.enterCodePanel.hidden = generate;
    }

    function openPairingModal() {
        showMessage(elements.pairingCodeMessage, "");
        showMessage(elements.enterPairingMessage, "");
        setPairingTab("generate");
        openModal(elements.pairingModal);
    }

    async function generatePairingCode() {
        if (!state.deviceId) {
            toast("Register this device first.", "error");
            return;
        }

        elements.generatePairingCodeBtn.disabled = true;
        elements.generatePairingCodeBtn.textContent = "Generating...";

        try {
            const result = await apiRequest("/pairing/code", {
                method: "POST",
                body: {
                    deviceId: state.deviceId
                }
            });

            const code = result.code || result.pairingCode;
            if (!code) {
                throw new Error("Backend response did not include a pairing code.");
            }

            elements.generatedPairingCode.textContent = String(code);
            elements.generatedCodeContainer.hidden = false;
            showMessage(elements.pairingCodeMessage, "Code generated. Share it only with the device you want to pair.", "success");

            const expiresInSeconds = Number(result.expiresInSeconds || 600);
            state.pairingExpiresAt = Date.now() + expiresInSeconds * 1000;
            startPairingCountdown();
        } catch (error) {
            showMessage(
                elements.pairingCodeMessage,
                `${error.message} Pairing API abhi backend mein implement karna baaki ho sakta hai.`,
                "error"
            );
        } finally {
            elements.generatePairingCodeBtn.disabled = false;
            elements.generatePairingCodeBtn.textContent = "Generate Pairing Code";
        }
    }

    function startPairingCountdown() {
        if (state.pairingExpiryTimer) {
            clearInterval(state.pairingExpiryTimer);
        }

        const update = () => {
            const secondsLeft = Math.max(
                0,
                Math.ceil((state.pairingExpiresAt - Date.now()) / 1000)
            );
            const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
            const seconds = String(secondsLeft % 60).padStart(2, "0");

            if (elements.pairingExpiry) {
                elements.pairingExpiry.textContent = `${minutes}:${seconds}`;
            }

            if (secondsLeft <= 0) {
                clearInterval(state.pairingExpiryTimer);
                state.pairingExpiryTimer = null;
                showMessage(elements.pairingCodeMessage, "This code has expired. Generate a new code.", "error");
            }
        };

        update();
        state.pairingExpiryTimer = setInterval(update, 1000);
    }

    async function copyPairingCode() {
        const code = elements.generatedPairingCode?.textContent?.trim();
        if (!code || code === "------") return;

        try {
            await navigator.clipboard.writeText(code);
            toast("Pairing code copied.", "success");
        } catch {
            const temporaryInput = document.createElement("textarea");
            temporaryInput.value = code;
            temporaryInput.style.position = "fixed";
            temporaryInput.style.opacity = "0";
            document.body.appendChild(temporaryInput);
            temporaryInput.select();

            const copied = document.execCommand("copy");
            temporaryInput.remove();

            toast(copied ? "Pairing code copied." : "Copy failed. Please copy the code manually.", copied ? "success" : "error");
        }
    }

    async function verifyPairingCode(event) {
        event.preventDefault();

        const code = elements.pairingCodeInput?.value.trim() || "";
        if (!code) {
            showMessage(elements.enterPairingMessage, "Enter the pairing code first.", "error");
            return;
        }

        elements.confirmPairingBtn.disabled = true;
        elements.confirmPairingBtn.textContent = "Verifying...";

        try {
            await apiRequest("/pairing/verify", {
                method: "POST",
                body: {
                    code,
                    deviceId: state.deviceId
                }
            });

            showMessage(elements.enterPairingMessage, "Device paired successfully!", "success");
            elements.pairingCodeInput.value = "";
            await loadDevices();
            toast("Device paired successfully.", "success");
        } catch (error) {
            showMessage(
                elements.enterPairingMessage,
                `${error.message} Pairing API backend mein implement hona zaroori hai.`,
                "error"
            );
        } finally {
            elements.confirmPairingBtn.disabled = false;
            elements.confirmPairingBtn.textContent = "Verify & Pair";
        }
    }

    async function loadDevices() {
        if (!state.deviceId) return;

        try {
            const result = await apiRequest("/devices");
            const devices = Array.isArray(result)
                ? result
                : (result.devices || []);

            renderDevices(devices);
        } catch (error) {
            // The current starter backend does not yet provide GET /devices.
            renderDevices([]);
            console.info("Device list is not available yet:", error.message);
        }
    }

    function renderDevices(devices) {
        if (!elements.devicesList) return;

        elements.devicesList.querySelectorAll(".device-card").forEach((card) => card.remove());

        if (!devices.length) {
            if (elements.emptyDevicesState) {
                elements.emptyDevicesState.hidden = false;
            }
            return;
        }

        if (elements.emptyDevicesState) {
            elements.emptyDevicesState.hidden = true;
        }

        devices
            .filter((device) => device.deviceId !== state.deviceId)
            .forEach((device) => {
                const card = document.createElement("article");
                card.className = "device-card";
                if (device.deviceId === state.activeDeviceId) {
                    card.classList.add("is-active");
                }

                const avatar = document.createElement("div");
                avatar.className = "device-avatar";
                avatar.textContent = "▣";
                avatar.setAttribute("aria-hidden", "true");

                const info = document.createElement("div");
                info.className = "device-info";

                const title = document.createElement("h3");
                title.textContent = device.deviceName || device.name || "Unnamed device";

                const status = document.createElement("p");
                status.className = "device-status";
                status.textContent = device.online ? "Online" : "Paired device";

                info.append(title, status);

                const selectButton = document.createElement("button");
                selectButton.type = "button";
                selectButton.className = "secondary-button";
                selectButton.textContent = "Open";
                selectButton.addEventListener("click", () => selectDevice(device));

                card.append(avatar, info, selectButton);
                elements.devicesList.appendChild(card);
            });
    }

    function selectDevice(device) {
        state.activeDeviceId = device.deviceId;

        if (elements.activeDeviceLabel) {
            elements.activeDeviceLabel.textContent =
                `Conversation with ${device.deviceName || device.name || "device"}`;
        }

        if (elements.messageInput) elements.messageInput.disabled = false;
        if (elements.sendMessageBtn) elements.sendMessageBtn.disabled = false;
        if (elements.chatStatus) elements.chatStatus.textContent = "Selected";

        loadMessages();
        loadDevices();
    }

    async function loadMessages() {
        if (!state.activeDeviceId) return;

        try {
            const result = await apiRequest(
                `/messages?deviceId=${encodeURIComponent(state.activeDeviceId)}`
            );
            const messages = Array.isArray(result)
                ? result
                : (result.messages || []);
            renderMessages(messages);
        } catch (error) {
            console.info("Messages API is not available yet:", error.message);
            toast("Messaging backend abhi configure karna baaki hai.", "error");
        }
    }

    function renderMessages(messages) {
        if (!elements.messageList) return;
        elements.messageList.querySelectorAll(".message-bubble").forEach((item) => item.remove());

        if (elements.emptyMessagesState) {
            elements.emptyMessagesState.hidden = messages.length > 0;
        }

        messages.forEach((message) => {
            const bubble = document.createElement("article");
            bubble.className = "message-bubble";
            if (message.senderDeviceId === state.deviceId || message.outgoing) {
                bubble.classList.add("is-outgoing");
            }

            const text = document.createElement("p");
            text.textContent = message.text || message.message || "";

            const meta = document.createElement("small");
            meta.className = "message-meta";
            const date = message.createdAt ? new Date(message.createdAt) : new Date();
            meta.textContent = Number.isNaN(date.getTime())
                ? ""
                : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            bubble.append(text, meta);
            elements.messageList.appendChild(bubble);
        });

        elements.messageList.scrollTop = elements.messageList.scrollHeight;
    }

    async function sendMessage(event) {
        event.preventDefault();

        const text = elements.messageInput?.value.trim() || "";
        if (!text) return;

        if (!state.activeDeviceId) {
            toast("Select a paired device first.", "error");
            return;
        }

        elements.sendMessageBtn.disabled = true;

        try {
            await apiRequest("/messages", {
                method: "POST",
                body: {
                    recipientDeviceId: state.activeDeviceId,
                    text
                }
            });

            elements.messageInput.value = "";
            await loadMessages();
        } catch (error) {
            toast(`${error.message} Messaging API backend mein implement karna baaki hai.`, "error");
        } finally {
            elements.sendMessageBtn.disabled = false;
        }
    }

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
        if (bytes < 1024) return `${bytes} B`;
        const units = ["KB", "MB", "GB", "TB"];
        let size = bytes / 1024;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
    }

    function renderSelectedFiles() {
        if (!elements.selectedFiles) return;
        elements.selectedFiles.replaceChildren();

        state.selectedFiles.forEach((file, index) => {
            const row = document.createElement("div");
            row.className = "selected-file";

            const details = document.createElement("div");
            details.className = "file-details";

            const name = document.createElement("strong");
            name.textContent = file.name;

            const size = document.createElement("span");
            size.textContent = formatBytes(file.size);

            details.append(name, size);

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "secondary-button";
            remove.textContent = "Remove";
            remove.setAttribute("aria-label", `Remove ${file.name}`);
            remove.addEventListener("click", () => {
                state.selectedFiles.splice(index, 1);
                renderSelectedFiles();
            });

            row.append(details, remove);
            elements.selectedFiles.appendChild(row);
        });

        if (elements.uploadFilesBtn) {
            elements.uploadFilesBtn.disabled = state.selectedFiles.length === 0;
        }
    }

    function handleFileSelection() {
        const newlySelected = Array.from(elements.fileInput?.files || []);
        const existing = new Set(state.selectedFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));

        newlySelected.forEach((file) => {
            const key = `${file.name}:${file.size}:${file.lastModified}`;
            if (!existing.has(key)) state.selectedFiles.push(file);
        });

        renderSelectedFiles();

        // Clear the input so selecting the same file again can trigger change.
        if (elements.fileInput) elements.fileInput.value = "";
    }

    async function uploadFiles(event) {
        event.preventDefault();

        if (!state.selectedFiles.length) {
            toast("Select at least one file first.", "error");
            return;
        }

        if (!state.activeDeviceId) {
            toast("Select a paired recipient device before sharing files.", "error");
            return;
        }

        const formData = new FormData();
        state.selectedFiles.forEach((file) => formData.append("files", file));
        formData.append("recipientDeviceId", state.activeDeviceId);

        elements.uploadFilesBtn.disabled = true;
        elements.uploadFilesBtn.textContent = "Uploading...";

        try {
            await apiRequest("/files", {
                method: "POST",
                body: formData
            });

            state.selectedFiles = [];
            renderSelectedFiles();
            toast("Files uploaded successfully.", "success");
            await loadSharedFiles();
        } catch (error) {
            toast(`${error.message} File upload API aur storage backend configure karna baaki hai.`, "error");
        } finally {
            elements.uploadFilesBtn.textContent = "Share Files";
            elements.uploadFilesBtn.disabled = state.selectedFiles.length === 0;
        }
    }

    async function loadSharedFiles() {
        try {
            const result = await apiRequest("/files");
            const files = Array.isArray(result) ? result : (result.files || []);
            renderSharedFiles(files);
        } catch (error) {
            console.info("Files API is not available yet:", error.message);
        }
    }

    function renderSharedFiles(files) {
        if (!elements.sharedFilesList) return;
        elements.sharedFilesList.replaceChildren();

        if (!files.length) {
            const message = document.createElement("p");
            message.className = "muted-text";
            message.textContent = "No shared files yet.";
            elements.sharedFilesList.appendChild(message);
            return;
        }

        files.forEach((file) => {
            const row = document.createElement("div");
            row.className = "shared-file-item";

            const details = document.createElement("div");
            details.className = "file-details";

            const name = document.createElement("strong");
            name.textContent = file.originalName || file.filename || "Shared file";

            const meta = document.createElement("span");
            meta.textContent = formatBytes(Number(file.size));

            details.append(name, meta);

            const link = document.createElement("a");
            link.textContent = "Download";
            link.href = file.downloadUrl || file.url || "#";
            if (link.href !== "#") {
                link.target = "_blank";
                link.rel = "noopener noreferrer";
            } else {
                link.addEventListener("click", (event) => {
                    event.preventDefault();
                    toast("Download endpoint backend mein configure karna baaki hai.", "error");
                });
            }

            row.append(details, link);
            elements.sharedFilesList.appendChild(row);
        });
    }

    async function renameDevice(event) {
        event.preventDefault();

        const newName = elements.renameDeviceInput?.value.trim() || "";
        if (!newName) {
            showMessage(elements.profileMessage, "Enter a device name.", "error");
            return;
        }

        if (newName.length > 40) {
            showMessage(elements.profileMessage, "Name must be 40 characters or fewer.", "error");
            return;
        }

        // This updates the local display name. A server-side rename endpoint
        // should be added when device persistence/authentication is implemented.
        state.deviceName = newName;
        localStorage.setItem(STORAGE_KEYS.deviceName, newName);

        if (elements.welcomeMessage) {
            elements.welcomeMessage.textContent =
                `Welcome back, ${newName}. Manage your connected devices.`;
        }

        updateProfileDetails();
        showMessage(elements.profileMessage, "Display name updated on this browser.", "success");
        toast("Display name updated.", "success");
    }

    function disconnectDevice() {
        const confirmed = window.confirm(
            "Disconnect this browser from the local session? This does not remove server-side pairings."
        );
        if (!confirmed) return;

        localStorage.removeItem(STORAGE_KEYS.deviceId);
        localStorage.removeItem(STORAGE_KEYS.deviceName);

        state.deviceId = null;
        state.deviceName = null;
        state.activeDeviceId = null;

        closeModal(elements.profileModal);
        showSetup();
        showMessage(elements.setupMessage, "This browser has been disconnected.");
    }

    function bindEvents() {
        elements.setupForm?.addEventListener("submit", registerDevice);

        elements.newPairingBtn?.addEventListener("click", openPairingModal);
        elements.emptyPairDeviceBtn?.addEventListener("click", openPairingModal);
        elements.refreshDevicesBtn?.addEventListener("click", loadDevices);

        elements.generateCodeTab?.addEventListener("click", () => setPairingTab("generate"));
        elements.enterCodeTab?.addEventListener("click", () => setPairingTab("enter"));
        elements.generatePairingCodeBtn?.addEventListener("click", generatePairingCode);
        elements.copyPairingCodeBtn?.addEventListener("click", copyPairingCode);
        elements.enterPairingCodeForm?.addEventListener("submit", verifyPairingCode);

        elements.messageForm?.addEventListener("submit", sendMessage);
        elements.fileInput?.addEventListener("change", handleFileSelection);
        elements.fileUploadForm?.addEventListener("submit", uploadFiles);
        elements.clearFilesBtn?.addEventListener("click", () => {
            state.selectedFiles = [];
            renderSelectedFiles();
        });

        elements.fileDropArea?.addEventListener("dragover", (event) => {
            event.preventDefault();
            elements.fileDropArea.classList.add("is-dragging");
        });
        elements.fileDropArea?.addEventListener("dragleave", () => {
            elements.fileDropArea.classList.remove("is-dragging");
        });
        elements.fileDropArea?.addEventListener("drop", (event) => {
            event.preventDefault();
            elements.fileDropArea.classList.remove("is-dragging");
            const files = Array.from(event.dataTransfer?.files || []);
            const existing = new Set(state.selectedFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
            files.forEach((file) => {
                const key = `${file.name}:${file.size}:${file.lastModified}`;
                if (!existing.has(key)) state.selectedFiles.push(file);
            });
            renderSelectedFiles();
        });

        elements.profileBtn?.addEventListener("click", () => {
            updateProfileDetails();
            openModal(elements.profileModal);
        });
        elements.renameDeviceForm?.addEventListener("submit", renameDevice);
        elements.logoutBtn?.addEventListener("click", disconnectDevice);

        elements.aboutBtn?.addEventListener("click", () => openModal(elements.aboutModal));
        elements.helpBtn?.addEventListener("click", () => openModal(elements.helpModal));

        elements.logoLink?.addEventListener("click", (event) => {
            event.preventDefault();
            if (state.deviceId) showDashboard();
            else showSetup();
        });

        document.querySelectorAll("[data-close-modal]").forEach((button) => {
            button.addEventListener("click", () => {
                closeModal(document.getElementById(button.dataset.closeModal));
            });
        });

        [elements.pairingModal, elements.profileModal, elements.aboutModal, elements.helpModal]
            .filter(Boolean)
            .forEach((dialog) => {
                dialog.addEventListener("click", (event) => {
                    if (event.target === dialog) closeModal(dialog);
                });
            });
    }

    function initialize() {
        bindEvents();

        if (state.deviceId && state.deviceName) {
            showDashboard();
        } else {
            showSetup();
        }

        setPairingTab("generate");
        renderSelectedFiles();
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();
