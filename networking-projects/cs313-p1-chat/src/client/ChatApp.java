package client;

import java.util.ArrayList;
import javafx.application.Platform;
import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.scene.Scene;
import javafx.stage.Stage;

/**
 * Entry point for the Chat Client application.
 * Loads the login screen and connects it to the networking client.
 */
public class ChatApp extends Application {

    // Server IP address (given as a command-line argument)
    private static String HOST;

    // Server port number (must match the server)
    private static int PORT = 5000;

    @Override
    public void start(Stage stage) throws Exception {

        // Load the Login screen from the FXML file
        FXMLLoader loader = new FXMLLoader(getClass().getResource("/client/login.fxml"));
        Scene scene = new Scene(loader.load());

        // Get the LoginController linked to this FXML file
        LoginController loginController = loader.getController();

        // Create the network client (handles communication with the server)
        client networkClient = new client();

        // Give the network client and connection details to the controller
        loginController.setClient(networkClient);
        loginController.setConnectionDetails(HOST, PORT);

        // Set up the main window
        stage.setTitle("Group 17 Chat");
        stage.setScene(scene);

        // Close the network connection when the window is closed
        stage.setOnCloseRequest(e -> networkClient.disconnect());

        stage.show();
    }

    public static void main(String[] args) {
        // Get the server IP from the command-line arguments
        if (args.length < 1) {
            System.err.println("Usage: client.ChatApp <host> [port]");
            System.exit(1);
        }
        HOST = args[0];
        if (args.length > 1) {
            try { PORT = Integer.parseInt(args[1]); }
            catch (NumberFormatException e) {
                System.err.println("Invalid port '" + args[1] + "', using " + PORT);
            }
        }
        launch(args);
    }
}