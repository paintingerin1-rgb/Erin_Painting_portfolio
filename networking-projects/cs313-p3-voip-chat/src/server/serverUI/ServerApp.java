package server.serverUI;

import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.scene.Scene;
import javafx.stage.Stage;
import server.Server;

public class ServerApp extends Application {

    private static int port = 5000;

    @Override
    public void start(Stage stage) throws Exception {
        FXMLLoader loader = new FXMLLoader(
                getClass().getResource("/server/serverUI/ServerUI.fxml"));
        Scene scene = new Scene(loader.load());

        ServerController controller = loader.getController();

        stage.setTitle("VoIP Chat — Server (port " + port + ")");
        stage.setScene(scene);
        stage.setOnCloseRequest(e -> Server.shutdown());
        stage.show();

        // Start the server automatically on a background thread
        Thread t = new Thread(() -> Server.launch(port, controller));
        t.setDaemon(true);
        t.start();
    }

    public static void main(String[] args) {
        if (args.length > 0) {
            try { port = Integer.parseInt(args[0]); } catch (NumberFormatException ignored) {}
        }
        launch(args);
    }
}