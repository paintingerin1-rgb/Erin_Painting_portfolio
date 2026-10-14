package server.serverUI;

import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.control.ListView;
import javafx.scene.control.TextArea;
import server.Server;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

public class ServerController {

    @FXML private TextArea         logArea;
    @FXML private ListView<String> userListView;

    private static final DateTimeFormatter TIME_FMT =
            DateTimeFormatter.ofPattern("HH:mm:ss");

    /** Append a timestamped line to the activity log. Thread-safe. */
    public void log(String message) {
        String line = "[" + LocalTime.now().format(TIME_FMT) + "]  " + message;
        Platform.runLater(() -> logArea.appendText(line + "\n"));
    }

    /** Replace the online-user list. Thread-safe. */
    public void updateUserList(List<String> names) {
        Platform.runLater(() -> {
            names.sort(String::compareToIgnoreCase);
            userListView.getItems().setAll(names);
        });
    }
}