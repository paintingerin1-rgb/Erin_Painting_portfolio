package client.ui;

import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.stage.Stage;

/**
 * Controller for the login screen.
 * Handles user input, validates connection details,
 * and opens the main application window after a successful connection.
 */
public class LoginController {

    private client.client networkClient = new client.client();

    @FXML private TextField usernameField;
    @FXML private TextField serverIpField;
    @FXML private TextField portField;
    @FXML private Button    connectButton;
    @FXML private Label     errorLabel;

    /**
     * Validates the login details and attempts to connect to the server.
     * The connection process runs on a background thread to keep the UI responsive.
     */
    @FXML
    private void handleConnect() {

        String username = usernameField.getText().trim();
        String ip       = serverIpField.getText().trim();
        String portStr  = portField.getText().trim();

        // Ensure all fields contain input
        if (username.isEmpty() || ip.isEmpty() || portStr.isEmpty()) {
            showError("Please fill in all fields.");
            return;
        }

        int port;

        // Validate that the port is numeric
        try {
            port = Integer.parseInt(portStr);
        } catch (NumberFormatException e) {
            showError("Port must be a number.");
            return;
        }

        connectButton.setDisable(true);
        connectButton.setText("Connecting...");

        // Run the network request in a separate thread
        new Thread(() -> {

            boolean success = networkClient.connect(ip, port, username);

            Platform.runLater(() -> {
                if (success) {
                    onConnectSuccess(username);
                } else {
                    onConnectFailure(
                        "Connection failed. Username might be taken or server is down."
                    );
                }
            });

        }).start();
    }

    /**
     * Loads the main application window after a successful connection.
     * Also links the UI controller with the networking client.
     */
    public void onConnectSuccess(String username) {

        try {
            FXMLLoader loader = new FXMLLoader(
                getClass().getResource("/client/ui/MainView.fxml")
            );

            Parent root = loader.load();

            MainController mc = loader.getController();

            mc.initUser(username);
            mc.setClient(networkClient);

            // Allow communication between the network layer and UI
            networkClient.setController(mc);

            Stage stage = (Stage) connectButton.getScene().getWindow();

            // Disconnect cleanly when the application closes
            stage.setOnCloseRequest(event -> {
                networkClient.disconnect();
                Platform.exit();
                System.exit(0);
            });

            stage.setScene(new Scene(root, 820, 580));
            stage.setTitle("PeerShare — " + username);
            stage.setResizable(true);

        } catch (Exception e) {

            showError("Failed to open main screen: " + e.getMessage());

            connectButton.setDisable(false);
            connectButton.setText("Connect");
        }
    }

    /**
     * Handles a failed connection attempt by displaying an error
     * and resetting the connect button.
     */
    public void onConnectFailure(String reason) {

        showError(reason);

        connectButton.setDisable(false);
        connectButton.setText("Connect");
    }

    /**
     * Displays an error message on the login screen.
     */
    private void showError(String msg) {

        errorLabel.setText(msg);
        errorLabel.setVisible(true);
        errorLabel.setManaged(true);
    }
}