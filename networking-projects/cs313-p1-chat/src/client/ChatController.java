package client;

import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Stage;
import shared.Message;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

/**
 * Controller for the chat UI.
 * Handles global chat, private chats, and updating the UI.
 */
public class ChatController {

    // FXML UI elements
    @FXML private TextArea globalChatArea;
    @FXML private TextField messageInput;
    @FXML private ListView<String> userListView;
    @FXML private Label statusLabel;

    // Maps for private chats
    private final Map<String, Stage>     privateWindows = new HashMap<>();
    private final Map<String, TextArea>  whisperAreas   = new HashMap<>();
    private final Map<String, TextField> privateInputs  = new HashMap<>();

    // Current user info
    private String myUsername;
    private client clientConnection;

    /**
     * Called after FXML loads.
     * Set up double-click to open private chat.
     */
    @FXML
    public void initialize() {
        userListView.setOnMouseClicked(event -> {
            if (event.getClickCount() == 2) {
                String selected = userListView.getSelectionModel().getSelectedItem();
                if (selected != null && !selected.equals(myUsername)) {
                    openPrivateWindowDirect(selected);
                }
            }
        });
    }

    public void setClient(client c)          { this.clientConnection = c; }
    public void setUsername(String username) { this.myUsername = username; }

    // Global chat

    /** Add a line to the main chat area */
    public void appendToGlobal(String line) {
        Platform.runLater(() -> globalChatArea.appendText(line + "\n"));
    }

    /** Refresh the online user list */
    public void updateUserList(ArrayList<String> names) {
        Platform.runLater(() -> {
            userListView.getItems().clear();
            userListView.getItems().addAll(names);
        });
    }

    /** Handle incoming private message */
    public void receiveWhisper(String sender, String text) {
        Platform.runLater(() -> {
            openPrivateWindowDirect(sender);
            appendToWhisper(sender, sender + ": " + text);
        });
    }

    /** Show an error in the chat */
    public void showError(String errorText) {
        appendToGlobal("[ERROR] " + errorText);
    }

    //Sending mesages

    /** Send message from main input */
    @FXML
    private void handleSend() {
        String text = messageInput.getText().trim();
        if (text.isEmpty()) return;

        if (clientConnection != null) {
            clientConnection.sendMessage(new Message(Message.Type.GLOBAL, myUsername, text));
        }
        messageInput.clear();
    }

    /** Send private message to a user */
    private void handlePrivateSend(String recipient, TextField input) {
        String text = input.getText().trim();
        if (text.isEmpty()) return;

        if (clientConnection != null) {
            Message msg = new Message(Message.Type.WHISPER, myUsername, text);
            msg.setRecipient(recipient);
            clientConnection.sendMessage(msg);
        }

        appendToWhisper(recipient, "You: " + text);
        input.clear();
    }

    //Private Chat Windows

    /** Open a private window from any thread */
    public void openPrivateWindow(String username) {
        Platform.runLater(() -> openPrivateWindowDirect(username));
    }

    /** Build and show a private chat window on the FX thread */
    private void openPrivateWindowDirect(String username) {
        if (privateWindows.containsKey(username)) {
            privateWindows.get(username).toFront();
            return;
        }

        TextArea chatArea = new TextArea();
        chatArea.setEditable(false);
        chatArea.setWrapText(true);

        TextField inputField = new TextField();
        inputField.setPromptText("Message " + username + "...");
        inputField.setOnAction(e -> handlePrivateSend(username, inputField));

        Button sendBtn = new Button("Send");
        sendBtn.getStyleClass().add("primary");
        sendBtn.setOnAction(e -> handlePrivateSend(username, inputField));

        HBox inputRow = new HBox(6, inputField, sendBtn);
        HBox.setHgrow(inputField, Priority.ALWAYS);

        VBox layout = new VBox(10, chatArea, inputRow);
        VBox.setVgrow(chatArea, Priority.ALWAYS);
        layout.setStyle("-fx-padding: 14;");
        layout.getStylesheets().add(getClass().getResource("/client/theme.css").toExternalForm());

        Stage window = new Stage();
        window.setTitle("Private — " + username);
        window.setScene(new Scene(layout, 400, 350));
        window.setOnCloseRequest(e -> {
            privateWindows.remove(username);
            whisperAreas.remove(username);
            privateInputs.remove(username);
        });

        privateWindows.put(username, window);
        whisperAreas.put(username, chatArea);
        privateInputs.put(username, inputField);

        window.show();
    }

    /** Append text to a private chat window */
    private void appendToWhisper(String username, String line) {
        TextArea area = whisperAreas.get(username);
        if (area != null) area.appendText(line + "\n");
    }
}