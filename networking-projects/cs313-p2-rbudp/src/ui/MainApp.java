package ui;

import controllers.ReceiverController;
import controllers.SenderController;
import javafx.application.Application;
import javafx.stage.Stage;

public class MainApp extends Application {

    @Override
    public void start(Stage primaryStage) {
        // Determine mode from command-line args: "sender", "receiver", or "both" (default)
        String mode = getParameters().getRaw().isEmpty()
                ? "both"
                : getParameters().getRaw().get(0).toLowerCase();

        // Initialize sender UI unless mode is "receiver"
        if (!mode.equals("receiver")) {
            SenderUI senderView = new SenderUI(primaryStage);
            new SenderController(senderView); // attach controller
            primaryStage.setX(60); // position window
            primaryStage.setY(80);
            primaryStage.show(); // display window
        }

        // Initialize receiver UI unless mode is "sender"
        if (!mode.equals("sender")) {
            Stage receiverStage = mode.equals("receiver") ? primaryStage : new Stage();
            ReceiverUI receiverView = new ReceiverUI(receiverStage); 
            new ReceiverController(receiverView); // attach controller
            receiverStage.setX(740); // position window
            receiverStage.setY(80);
            receiverStage.show(); // display window
        }
    }

    public static void main(String[] args) {
        launch(args); 
    }
}