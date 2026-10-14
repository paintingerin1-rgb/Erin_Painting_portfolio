package client.ui;

import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Stage;
import shared.Message;

import java.util.ArrayList;

/**
 * Controller for the main chat UI (FXML: ChatUI.fxml).
 */
public class ChatController {

    // ── FXML bindings ────────────────────────────────────────────────────────

    @FXML private javafx.scene.control.TextArea         globalChatArea;
    @FXML private javafx.scene.control.TextField        messageInput;
    @FXML private javafx.scene.control.ListView<String> userListView;
    @FXML private javafx.scene.control.Label            statusLabel;

    @FXML private javafx.scene.control.Button recordVoiceNoteBtn;
    @FXML private javafx.scene.control.Button hangUpBtn;
    @FXML private javafx.scene.control.Label  callStatusLabel;

    @FXML private javafx.scene.layout.VBox   globalVoiceNotePanel;
    @FXML private javafx.scene.control.Label globalVoiceNoteHeader;
    /**
     * Optional inline call banner — add these to ChatUI.fxml to get an
     * embedded Accept/Decline bar instead of a popup Stage:
     *
     *   <HBox fx:id="incomingCallBar" visible="false" managed="false"
     *         style="-fx-background-color:#1d3557;-fx-padding:8;-fx-spacing:10;-fx-alignment:CENTER_LEFT;">
     *     <Label fx:id="incomingCallLabel" textFill="white" style="-fx-font-size:13;"/>
     *     <Button fx:id="acceptCallBtn"  text="Accept"  onAction="#handleAcceptCall"
     *             style="-fx-background-color:#2a9d8f;-fx-text-fill:white;"/>
     *     <Button fx:id="declineCallBtn" text="Decline" onAction="#handleDeclineCall"
     *             style="-fx-background-color:#ef233c;-fx-text-fill:white;"/>
     *   </HBox>
     *
     * If these nodes are absent the controller falls back to an always-on-top Stage.
     */
    @FXML private javafx.scene.layout.HBox   incomingCallBar;
    @FXML private javafx.scene.control.Label  incomingCallLabel;
    @FXML private javafx.scene.control.Button acceptCallBtn;
    @FXML private javafx.scene.control.Button declineCallBtn;

    // ── Collaborators ─────────────────────────────────────────────────────────

    private client        clientConnection;
    private WindowManager windowManager;

    // ── State ─────────────────────────────────────────────────────────────────

    private String          myUsername;
    private final ArrayList<String> activeCallGroup = new ArrayList<>();
    
    private boolean         recording       = false;
    private String          currentChannel  = null;

    private Stage primaryStage;

    /** Held while an incoming call is awaiting the user's response. */
    private Message pendingCallRequest = null;

    // ═══════════════════════════════════════════════════════════════════════════
    // Initialisation
    // ═══════════════════════════════════════════════════════════════════════════

    @FXML
    public void initialize() {
        if (hangUpBtn       != null) hangUpBtn.setVisible(false);
        if (callStatusLabel != null) callStatusLabel.setText("");
        hideIncomingCallBar();

        userListView.setOnMouseClicked(event -> {
            String sel = userListView.getSelectionModel().getSelectedItem();
            if (sel == null || sel.equals(myUsername)) return;
            if (event.getClickCount() == 2 && windowManager != null)
                windowManager.openWhisperWindowDirect(sel);
        });

        ContextMenu ctx = new ContextMenu();
        MenuItem callItem = new MenuItem("Call");
        callItem.setOnAction(e -> {
            String sel = userListView.getSelectionModel().getSelectedItem();
            if (sel != null && !sel.equals(myUsername)) handleCallOrHangUp(sel);
        });
        MenuItem whisperItem = new MenuItem("Whisper");
        whisperItem.setOnAction(e -> {
            String sel = userListView.getSelectionModel().getSelectedItem();
            if (sel != null && !sel.equals(myUsername) && windowManager != null)
                windowManager.openWhisperWindow(sel);
        });
        ctx.getItems().addAll(callItem, whisperItem);
        userListView.setContextMenu(ctx);
    }

    // ── Setters ───────────────────────────────────────────────────────────────

    public void setClient(client c) {
        this.clientConnection = c;
        this.windowManager    = new WindowManager(c, this);
    }

    public void setUsername(String username) {
        this.myUsername = username;
        if (statusLabel != null) statusLabel.setText("Connected as " + username);
    }

    boolean isPeerInActiveCall(String peer) { return activeCallGroup.contains(peer); }
    String getMyUsername()     { return myUsername; }

    public void setPrimaryStage(Stage stage) { this.primaryStage = stage; }

    // ═══════════════════════════════════════════════════════════════════════════
    // Incoming server callbacks
    // ═══════════════════════════════════════════════════════════════════════════

    public void onUserDisconnected(String offlineUser) {
        if (windowManager != null) {
            windowManager.closeWhisperWindow(offlineUser);
            windowManager.syncCallButton(offlineUser, false);
        }
    }

    public void appendToGlobal(String line) {
        Platform.runLater(() -> globalChatArea.appendText(line + "\n"));
    }

    public void updateUserList(ArrayList<String> names) {
        Platform.runLater(() -> {
            names.sort(String::compareToIgnoreCase);
            userListView.getItems().setAll(names);
        });
    }

    public void receiveWhisper(String sender, String text) {
        Platform.runLater(() -> {
            windowManager.openWhisperWindowDirect(sender);
            windowManager.appendToWhisper(sender, sender + ": " + text);
        });
    }

    public void receiveChannelMessage(String channelName, String sender, String text) {
        Platform.runLater(() -> {
            if (channelName.equals(currentChannel)) {
                windowManager.openChannelWindowDirect(channelName);
                windowManager.appendToChannel(channelName, sender + ": " + text);
            }
        });
    }

    public void showError(String errorText) {
        appendToGlobal("[ERROR] " + errorText);
    }

    public void onServerDisconnected() {
        // Stop any active calls cleanly
        if (!activeCallGroup.isEmpty()) {
            activeCallGroup.clear();
            updateCallStatus("");
        }
        if (clientConnection != null) {
            clientConnection.forceIdle();
        }
 
        // Show a blocking alert so the user knows what happened
        Alert alert = new Alert(Alert.AlertType.ERROR);
        alert.setTitle("Disconnected");
        alert.setHeaderText("Server has gone offline.");
        alert.setContentText("The connection to the server was lost.");
        alert.showAndWait();
 
        // Close the main window — this triggers stage.setOnCloseRequest → networkClient.disconnect()
        if (primaryStage != null) {
            primaryStage.close();
        } else {
            // Fallback: force exit if we can't find the stage
            Platform.exit();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Main input – send / commands
    // ═══════════════════════════════════════════════════════════════════════════

    @FXML
    private void handleSend() {
        String text = messageInput.getText().trim();
        if (text.isEmpty()) return;
        messageInput.clear();

        if (text.startsWith("/")) {
            handleCommand(text);
        } else {
            if (clientConnection != null)
                clientConnection.sendMessage(new Message(Message.Type.GLOBAL, myUsername, text));
            // Display locally — server no longer echoes back to the sender
            appendToGlobal("You: " + text);
        }
    }

    private void handleCommand(String raw) {
        String[] parts = raw.split("\\s+", 3);
        String cmd = parts[0].toLowerCase();

        switch (cmd) {
            case "/call" -> {
                if (parts.length < 2) { showError("Usage: /call <username>"); return; }
                handleCallOrHangUp(parts[1]);
            }
            case "/hangup" -> handleHangUp();
            case "/whisper" -> {
                if (parts.length < 3) { showError("Usage: /whisper <username> <message>"); return; }
                windowManager.openWhisperWindowDirect(parts[1]);
                Message m = new Message(Message.Type.WHISPER, myUsername, parts[2]);
                m.setRecipient(parts[1]);
                if (clientConnection != null) clientConnection.sendMessage(m);
                windowManager.appendToWhisper(parts[1], "You: " + parts[2]);
            }
            case "/join" -> {
                if (parts.length < 2) { showError("Usage: /join <channel>"); return; }
                joinChannel(parts[1]);
            }
            case "/leave"      -> leaveCurrentChannel();
            case "/conference" -> {
                if (parts.length < 2) { showError("Usage: /conference <user1> [user2 ...]"); return; }
                startConferenceCall(raw.split("\\s+"), 1);
            }
            default -> showError("Unknown command: " + cmd
                    + "  |  Available: /call /hangup /whisper /join /leave /conference");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Voice calls
    // ═══════════════════════════════════════════════════════════════════════════

    void handleCallOrHangUp(String peer) {
        if (activeCallGroup.isEmpty()) {
            initiateCall(peer);
        } else if (activeCallGroup.contains(peer)) {
            handleHangUp();
        } else {
            Platform.runLater(() -> {
                Alert alert = new Alert(Alert.AlertType.CONFIRMATION);
                alert.setTitle("Already in a call");
                alert.setHeaderText("You are currently in a call.");
                alert.setContentText("End current call and call " + peer + "?");
                alert.getButtonTypes().setAll(ButtonType.YES, ButtonType.NO);
                alert.showAndWait().ifPresent(btn -> {
                    if (btn == ButtonType.YES) { handleHangUp(); initiateCall(peer); }
                });
            });
        }
    }

    public void initiateCall(String peer) {
        if (!activeCallGroup.isEmpty()) return;
        activeCallGroup.add(peer);
        updateCallStatus("Calling " + peer + "...");
        windowManager.syncCallButton(peer, true);
        if (clientConnection != null) clientConnection.startCall(peer);
    }

    public void onIncomingCall(Message request) {
        System.out.println("incoming calllll from " + request.getSender());
        Platform.runLater(() -> {
            pendingCallRequest = request;
            String caller = request.getSender();

            if (incomingCallBar != null) {
                if (incomingCallLabel != null)
                    incomingCallLabel.setText("📞  " + caller + " is calling...");
                showIncomingCallBar();
            } else {
                showCallStage(caller, request);
            }
            appendToGlobal("[CALL] Incoming call from " + caller);
        });
    }

    private void showCallStage(String caller, Message request) {
        Stage callStage = new Stage();
        callStage.setTitle("Incoming Call");
        callStage.setAlwaysOnTop(true);
        callStage.setResizable(false);

        Label lbl = new Label("📞  " + caller + " is calling you");
        lbl.setStyle("-fx-font-size:15; -fx-font-weight:bold;");

        Button acceptBtn  = new Button("Accept");
        Button declineBtn = new Button("Decline");
        acceptBtn.getStyleClass().add("success");
        declineBtn.getStyleClass().add("danger");

        acceptBtn.setOnAction(e  -> { callStage.close(); doAcceptCall(request); });
        declineBtn.setOnAction(e -> { callStage.close(); doDeclineCall(request); });

        callStage.setOnCloseRequest(e -> {
            if (pendingCallRequest == request) doDeclineCall(request);
        });

        HBox buttons = new HBox(10, acceptBtn, declineBtn);
        buttons.setStyle("-fx-alignment:center;");
        VBox layout = new VBox(14, lbl, buttons);
        layout.setStyle("-fx-padding:24; -fx-alignment:center;");
        layout.getStylesheets().add(getClass().getResource("/client/ui/theme.css").toExternalForm());

        callStage.setScene(new javafx.scene.Scene(layout, 340, 130));
        callStage.show();
    }

    @FXML
    public void handleAcceptCall() {
        Message req = pendingCallRequest;
        pendingCallRequest = null;
        hideIncomingCallBar();
        if (req != null) doAcceptCall(req);
    }

    @FXML
    public void handleDeclineCall() {
        Message req = pendingCallRequest;
        pendingCallRequest = null;
        hideIncomingCallBar();
        if (req != null) doDeclineCall(req);
    }

    private void doAcceptCall(Message request) {
        String caller = request.getSender();
        if (!activeCallGroup.isEmpty()) {
            handleHangUp();
        }
        activeCallGroup.add(caller);
        updateCallStatus("In call with " + caller);
        windowManager.syncCallButton(caller, true);
        if (clientConnection != null) clientConnection.acceptCall(request);
    }

    private void doDeclineCall(Message request) {
        if (clientConnection != null) clientConnection.denyCall(request);
        appendToGlobal("[CALL] Declined call from " + request.getSender());
    }

    public void onCallAccepted(String peer) {
        Platform.runLater(() -> {
            if (!activeCallGroup.contains(peer)) activeCallGroup.add(peer);
            updateCallStatus("In call with " + String.join(", ", activeCallGroup));
            windowManager.syncCallButton(peer, true);
            appendToGlobal("[CALL] Call connected with " + peer);
        });
    }

    @FXML
    public void handleHangUp() {
        if (activeCallGroup.isEmpty()) { showError("No active call to hang up."); return; }
        for (String peer : activeCallGroup) {
            windowManager.syncCallButton(peer, false);
            if (clientConnection != null) clientConnection.endCall(peer);
        }
        activeCallGroup.clear();
        updateCallStatus("");
        if (clientConnection != null) clientConnection.forceIdle();
    }

    public void onCallTerminated(String peer) {
        Platform.runLater(() -> {
            if (pendingCallRequest != null && peer.equals(pendingCallRequest.getSender())) {
                pendingCallRequest = null;
                hideIncomingCallBar();
                appendToGlobal("[CALL] " + peer + " cancelled the call.");
                return;
            }
            if (activeCallGroup.contains(peer)) {
                activeCallGroup.remove(peer);
                windowManager.syncCallButton(peer, false);
                appendToGlobal("[CALL] " + peer + " ended the call.");
                if (activeCallGroup.isEmpty()) {
                    updateCallStatus("");
                    if (clientConnection != null) clientConnection.forceIdle();
                } else {
                    updateCallStatus("In call with " + String.join(", ", activeCallGroup));
                }
            }
        });
    }

    public void onCallDeclined(String peer) {
        Platform.runLater(() -> {
            if (activeCallGroup.contains(peer)) {
                activeCallGroup.remove(peer);
                windowManager.syncCallButton(peer, false);
                appendToGlobal("[CALL] " + peer + " is busy or declined.");
                if (activeCallGroup.isEmpty()) {
                    updateCallStatus("");
                    if (clientConnection != null) clientConnection.forceIdle();
                }
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Conference calls
    // ═══════════════════════════════════════════════════════════════════════════

    public void startConferenceCall(String[] parts, int startIdx) {
        StringBuilder invited = new StringBuilder();
        activeCallGroup.clear();
        for (int i = startIdx; i < parts.length; i++) {
            invited.append(parts[i]).append(" ");
            activeCallGroup.add(parts[i]);
            windowManager.syncCallButton(parts[i], true);
            if (clientConnection != null) clientConnection.startCall(parts[i]);
        }
        appendToGlobal("[CONFERENCE] Inviting: " + invited.toString().trim());
        updateCallStatus("Conference with " + invited.toString().trim());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Conference text channels
    // ═══════════════════════════════════════════════════════════════════════════

    public void joinChannel(String channelName) {
        if (channelName.equals(currentChannel)) {
            windowManager.openChannelWindow(channelName);
            return;
        }
        currentChannel = channelName;
        appendToGlobal("[CHANNEL] Joined #" + channelName);
        windowManager.openChannelWindow(channelName);

        if (clientConnection != null) {
            Message m = new Message(Message.Type.CHANNEL_JOIN, myUsername, "#" + channelName);
            m.setChannelName(channelName);
            clientConnection.sendMessage(m);
        }
    }

    public void leaveCurrentChannel() {
        if (currentChannel == null) { showError("Not in any channel."); return; }
        appendToGlobal("[CHANNEL] Left #" + currentChannel);
        windowManager.closeChannelWindow(currentChannel);

        if (clientConnection != null) {
            Message m = new Message(Message.Type.CHANNEL_LEAVE, myUsername, "#" + currentChannel);
            m.setChannelName(currentChannel);
            clientConnection.sendMessage(m);
        }
        currentChannel = null;
    }

    void onChannelWindowClosed(String channelName) {
        if (channelName.equals(currentChannel)) currentChannel = null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Voice notes
    // ═══════════════════════════════════════════════════════════════════════════

    @FXML
    public void handleRecordVoiceNote() {
        if (!recording) {
            recording = true;
            if (recordVoiceNoteBtn != null) recordVoiceNoteBtn.setText("Stop Recording");
            if (clientConnection   != null) clientConnection.startRecordingVoiceNote();
        } else {
            recording = false;
            if (recordVoiceNoteBtn != null) recordVoiceNoteBtn.setText("Record Voice Note");
            String target = userListView.getSelectionModel().getSelectedItem();
            if (clientConnection != null)
                clientConnection.stopAndSendVoiceNote(target != null ? target : "ALL");
        }
    }

        public void receiveVoiceNote(String sender, byte[] audioData) {
        appendToGlobal("🎙️ [VOICE NOTE] Received from " + sender + " — open their chat window to play");
        if (windowManager != null) {
            windowManager.addVoiceNoteToPanel(sender, audioData);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Sidebar
    // ═══════════════════════════════════════════════════════════════════════════

    @FXML
    private void handleCallSelected() {
        String selected = userListView.getSelectionModel().getSelectedItem();
        if (selected == null)            { showError("Select a user from the list first."); return; }
        if (selected.equals(myUsername)) { showError("You cannot call yourself."); return; }
        handleCallOrHangUp(selected);
    }

    public void openPrivateWindow(String username) {
        if (windowManager != null) windowManager.openWhisperWindow(username);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Internal helpers
    // ═══════════════════════════════════════════════════════════════════════════

    private void updateCallStatus(String text) {
        Platform.runLater(() -> {
            if (callStatusLabel != null) callStatusLabel.setText(text);
            if (hangUpBtn       != null) hangUpBtn.setVisible(!text.isEmpty());
        });
    }

    private void showIncomingCallBar() {
        if (incomingCallBar == null) return;
        incomingCallBar.setVisible(true);
        incomingCallBar.setManaged(true);
    }

    private void hideIncomingCallBar() {
        if (incomingCallBar == null) return;
        incomingCallBar.setVisible(false);
        incomingCallBar.setManaged(false);
    }
}