package client.ui;

import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.stage.Stage;

/**
 * Entry point for the JavaFX client application.
 * Loads and displays the login interface when the program starts.
 */
public class App extends Application {

    /**
     * Creates the main application window and loads the LoginView.fxml file.
     * This method is automatically called by JavaFX when the application launches.
     */
    @Override
    public void start(Stage stage) throws Exception {
        Parent root = FXMLLoader.load(
            getClass().getResource("/client/ui/LoginView.fxml")
        );

        stage.setScene(new Scene(root, 440, 500));
        stage.setTitle("PeerShare");
        stage.setResizable(false);
        stage.show();
    }

    /**
     * Launches the JavaFX application.
     * Execution begins here when the program is run.
     */
    public static void main(String[] args) {
        launch(args);
    }
}