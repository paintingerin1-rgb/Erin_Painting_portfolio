package client;

import javafx.application.Platform;
import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.stage.Stage;

import java.io.IOException;

/**
 * LoginController
 * This class manages the login UI and coordinates with the client
 * to establish a server connection. It is responsible for the scene transition 
 * from the login gate to the main chat environment.
 */

public class LoginController {

    @FXML private TextField usernameField;
    @FXML private Label statusLabel;

    private client networkClient;
    private String host;
    private int port;

    public void setClient(client networkClient) {
        this.networkClient = networkClient;
    }

    public void setConnectionDetails(String host, int port) {
        this.host = host;
        this.port = port;
    }

    /** Called when the login button is pressed */
    @FXML
    public void handleLogin(ActionEvent event) {
        String username = usernameField.getText().trim();

        if (username.isEmpty()) {
            statusLabel.setText("Please enter a username.");
            return;
        }

        statusLabel.setText("Connecting...");

        // Run network call on background thread so UI doesn't freeze
        new Thread(() -> {
            boolean success = networkClient.connect(host, port, username);

            Platform.runLater(() -> {
                if (success) {
                    switchToChat(username);
                } else {
                    statusLabel.setText("Username taken or server unavailable.");
                }
            });
        }).start();
    }

    /** Switches scene from login to the main chat UI */
    public void switchToChat(String username) {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/client/ChatUI.fxml"));
            Parent chatRoot = loader.load();

            ChatController chatController = loader.getController();
            chatController.setClient(networkClient);
            chatController.setUsername(username);
            networkClient.setController(chatController);

            Stage stage = (Stage) usernameField.getScene().getWindow();
            stage.setScene(new Scene(chatRoot));
            stage.setTitle("Chat — " + username);

        } catch (IOException e) {
            System.err.println("Failed to load chat screen: " + e.getMessage());
        }
    }
}