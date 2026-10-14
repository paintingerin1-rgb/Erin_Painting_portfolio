package client.ui;

import javafx.application.Platform;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Stage;
import shared.Message;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Manages all secondary JavaFX windows for the chat client.
 *
 * <p>Owns and builds three window types:
 * <ul>
 *   <li><b>Whisper windows</b> – private 1-to-1 chat with a Call/Hang Up button
 *       and a persistent voice note history panel.</li>
 *   <li><b>Channel windows</b> – group text-channel chat rooms</li>
 *   <li><b>Voice note panel</b> – embedded inside the whisper window; shows all
 *       received voice notes with Play / Replay buttons that stay available.</li>
 * </ul>
 */
public class WindowManager {

    // ── Back-references ───────────────────────────────────────────────────────
    private final client clientConnection;
    private final ChatController controller;

    // ── Whisper window state ──────────────────────────────────────────────────
    private final Map<String, Stage>     privateWindows  = new HashMap<>();
    private final Map<String, TextArea>  whisperAreas    = new HashMap<>();
    private final Map<String, TextField> privateInputs   = new HashMap<>();
    private final Map<String, Button>    whisperCallBtns = new HashMap<>();

    /**
     * Per-whisper-window VBox that holds the list of received voice note rows.
     * Keyed by the remote username.
     */
    private final Map<String, VBox> voiceNotePanels = new HashMap<>();

    // ── Channel window state ──────────────────────────────────────────────────
    private final Map<String, Stage>    channelWindows = new HashMap<>();
    private final Map<String, TextArea> channelAreas   = new HashMap<>();

    // ═══════════════════════════════════════════════════════════════════════════
    // Construction
    // ═══════════════════════════════════════════════════════════════════════════

    public WindowManager(client clientConnection, ChatController controller) {
        this.clientConnection = clientConnection;
        this.controller       = controller;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Whisper windows
    // ═══════════════════════════════════════════════════════════════════════════

    /** Opens a whisper window from any thread. */
    public void openWhisperWindow(String username) {
        Platform.runLater(() -> openWhisperWindowDirect(username));
    }

    /**
     * Builds and shows a private chat window.  Must be called on the FX thread.
     *
     * <p>Layout (top → bottom):
     * <pre>
     *   callStatusLbl          (italic, shown only while in call)
     *   chatArea               (grows, chat history)
     *   ── Voice Notes ──      (separator label, hidden until first note)
     *   voiceNotePanel         (VBox; one row per received note)
     *   inputRow               (TextField + Send + Call/HangUp)
     * </pre>
     */
    public void openWhisperWindowDirect(String username) {
        if (privateWindows.containsKey(username)) {
            privateWindows.get(username).toFront();
            return;
        }

        // ── Chat history ──────────────────────────────────────────────────────
        TextArea chatArea = new TextArea();
        chatArea.setEditable(false);
        chatArea.setWrapText(true);

        // ── Call state label ──────────────────────────────────────────────────
        Label callStatusLbl = new Label(
                controller.isPeerInActiveCall(username) ? "In call with " + username : "");
        callStatusLbl.getStyleClass().add("accent-text");

        // ── Call / Hang Up button ─────────────────────────────────────────────
        boolean inCallWithUser = controller.isPeerInActiveCall(username);
        Button callBtn = new Button(inCallWithUser ? "Hang Up" : "Call " + username);
        applyCallBtnStyle(callBtn, inCallWithUser);
        callBtn.setOnAction(e -> controller.handleCallOrHangUp(username));
        whisperCallBtns.put(username, callBtn);

        // ── Voice note panel (persistent, grows as notes arrive) ──────────────
        Label vnHeader = new Label("🎙  VOICE NOTES");
        vnHeader.getStyleClass().add("section-title");
        vnHeader.setVisible(false);   // shown when the first note arrives
        vnHeader.setManaged(false);

        VBox vnPanel = new VBox(6);
        voiceNotePanels.put(username, vnPanel);

        // Store the header reference so addVoiceNoteToPanel() can reveal it
        vnPanel.getProperties().put("header", vnHeader);

        // ── Text input row ────────────────────────────────────────────────────
        TextField inputField = new TextField();
        inputField.setPromptText("Message " + username + "...");
        inputField.setOnAction(e -> sendWhisper(username, inputField));

        Button sendBtn = new Button("Send");
        sendBtn.getStyleClass().add("primary");
        sendBtn.setOnAction(e -> sendWhisper(username, inputField));

        HBox inputRow = new HBox(6, inputField, sendBtn, callBtn);
        HBox.setHgrow(inputField, Priority.ALWAYS);

        // ── Full layout ───────────────────────────────────────────────────────
        VBox layout = new VBox(10,
                callStatusLbl,
                chatArea,
                vnHeader,
                vnPanel,
                inputRow);
        VBox.setVgrow(chatArea, Priority.ALWAYS);
        layout.setStyle("-fx-padding: 14;");
        layout.getStylesheets().add(getClass().getResource("/client/ui/theme.css").toExternalForm());

        // ── Stage ─────────────────────────────────────────────────────────────
        Stage window = new Stage();
        window.setTitle("Private — " + username);
        window.setScene(new Scene(layout, 460, 440));
        window.setOnCloseRequest(e -> {
            privateWindows.remove(username);
            whisperAreas.remove(username);
            privateInputs.remove(username);
            whisperCallBtns.remove(username);
            voiceNotePanels.remove(username);
        });

        privateWindows.put(username, window);
        whisperAreas.put(username, chatArea);
        privateInputs.put(username, inputField);
        window.show();
    }

    /** Appends a line to an open whisper window. No-op if not open. */
    public void appendToWhisper(String username, String line) {
        TextArea area = whisperAreas.get(username);
        if (area != null) area.appendText(line + "\n");
    }

    /** Syncs the Call/Hang Up button label and colour in a whisper window. */
    public void syncCallButton(String peer, boolean inCall) {
        Platform.runLater(() -> {
            Button btn = whisperCallBtns.get(peer);
            if (btn != null) {
                btn.setText(inCall ? "Hang Up" : "Call " + peer);
                applyCallBtnStyle(btn, inCall);
            }
        });
    }

    /** Sends a whisper typed in the whisper window. */
    private void sendWhisper(String recipient, TextField input) {
        String text = input.getText().trim();
        if (text.isEmpty()) return;
        if (clientConnection != null) {
            Message msg = new Message(Message.Type.WHISPER, controller.getMyUsername(), text);
            msg.setRecipient(recipient);
            clientConnection.sendMessage(msg);
        }
        appendToWhisper(recipient, "You: " + text);
        input.clear();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Voice note panel (embedded inside whisper window)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Adds a playable voice-note row to the whisper window for {@code sender}.
     *
     * <p>Opens the whisper window first if it isn't already open.
     * Each row shows the note number, a Play button that can be pressed any
     * number of times, and a "Playing…" label while audio is streaming.
     *
     * <p>FIX over the old {@code showVoiceNotePopup}: notes are persistent —
     * they don't disappear when a throwaway Stage is closed — and any note
     * can be replayed at any time.
     *
     * @param sender    username who sent the note
     * @param audioData raw PCM bytes
     */
    public void addVoiceNoteToPanel(String sender, byte[] audioData) {
        Platform.runLater(() -> {
            // Make sure the window is open so the panel exists
            openWhisperWindowDirect(sender);

            VBox panel = voiceNotePanels.get(sender);
            if (panel == null) return;   // shouldn't happen after openWhisperWindowDirect

            // Reveal the header the first time a note arrives
            Label header = (Label) panel.getProperties().get("header");
            if (header != null && !header.isVisible()) {
                header.setVisible(true);
                header.setManaged(true);
            }

            int noteNumber = panel.getChildren().size() + 1;

            Label statusLbl = new Label();
            statusLbl.getStyleClass().add("hint");

            Button playBtn = new Button("▶  Play note #" + noteNumber);
            playBtn.getStyleClass().addAll("primary", "small");

            playBtn.setOnAction(e -> {
                // Disable during playback so the user doesn't stack threads;
                // re-enable when done so they can replay.
                playBtn.setDisable(true);
                statusLbl.setText("Playing…");
                new Thread(() -> {
                    if (clientConnection != null) clientConnection.playVoiceNote(audioData);
                    Platform.runLater(() -> {
                        playBtn.setDisable(false);
                        statusLbl.setText("Done ✓");
                    });
                }).start();
            });

            HBox row = new HBox(8, playBtn, statusLbl);
            row.setStyle("-fx-alignment: CENTER_LEFT;");
            panel.getChildren().add(row);

            // Also log a line in the chat area for awareness
            appendToWhisper(sender, "🎙 [Voice note #" + noteNumber + " — press Play below]");
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Channel windows
    // ═══════════════════════════════════════════════════════════════════════════

    public void openChannelWindow(String channelName) {
        Platform.runLater(() -> openChannelWindowDirect(channelName));
    }

    public void openChannelWindowDirect(String channelName) {
        if (channelWindows.containsKey(channelName)) {
            channelWindows.get(channelName).toFront();
            return;
        }

        TextArea chatArea = new TextArea();
        chatArea.setEditable(false);
        chatArea.setWrapText(true);

        TextField inputField = new TextField();
        inputField.setPromptText("Message #" + channelName + "...");

        Button sendBtn = new Button("Send");
        sendBtn.getStyleClass().add("primary");
        sendBtn.setOnAction(e -> {
            String text = inputField.getText().trim();
            if (text.isEmpty()) return;
            if (clientConnection != null) clientConnection.sendChannelMessage(channelName, text);
            appendToChannel(channelName, "You: " + text);
            inputField.clear();
        });
        inputField.setOnAction(e -> sendBtn.fire());

        HBox inputRow = new HBox(6, inputField, sendBtn);
        HBox.setHgrow(inputField, Priority.ALWAYS);

        VBox layout = new VBox(10, chatArea, inputRow);
        VBox.setVgrow(chatArea, Priority.ALWAYS);
        layout.setStyle("-fx-padding: 14;");
        layout.getStylesheets().add(getClass().getResource("/client/ui/theme.css").toExternalForm());

        Stage window = new Stage();
        window.setTitle("Channel — #" + channelName);
        window.setScene(new Scene(layout, 450, 380));
        window.setOnCloseRequest(e -> {
            channelWindows.remove(channelName);
            channelAreas.remove(channelName);
            controller.onChannelWindowClosed(channelName);
        });

        channelWindows.put(channelName, window);
        channelAreas.put(channelName, chatArea);
        window.show();
    }

    public void appendToChannel(String channelName, String line) {
        TextArea area = channelAreas.get(channelName);
        if (area != null) area.appendText(line + "\n");
    }

    public void closeChannelWindow(String channelName) {
        Stage w = channelWindows.remove(channelName);
        channelAreas.remove(channelName);
        if (w != null) Platform.runLater(w::close);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Internal helpers
    // ═══════════════════════════════════════════════════════════════════════════

    private void applyCallBtnStyle(Button btn, boolean inCall) {
        btn.getStyleClass().removeAll("danger", "success");
        btn.getStyleClass().add(inCall ? "danger" : "success");
    }
    public void closeWhisperWindow(String username) {
        Platform.runLater(() -> {
            Stage window = privateWindows.remove(username);
            if (window != null) {
                window.close();
                whisperAreas.remove(username);
                privateInputs.remove(username);
                whisperCallBtns.remove(username);
                voiceNotePanels.remove(username);
            }
        });
    }
}