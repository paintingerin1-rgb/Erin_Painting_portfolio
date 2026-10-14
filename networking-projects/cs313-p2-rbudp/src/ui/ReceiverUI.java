package ui;

import javafx.animation.PauseTransition;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;
import javafx.stage.Stage;
import javafx.util.Duration;
import java.io.File;

/**
 * Receiver window for RBUDP: choose a save folder and port, then listen for an incoming file.
 * Styling lives in theme.css; this class only builds the layout.
 */
public class ReceiverUI {

    private final TextField saveDirField  = new TextField(System.getProperty("user.home"));
    private final TextField portField     = new TextField("9876");
    private final ProgressBar progressBar = new ProgressBar(0);
    private final Label statusLabel       = new Label("");

    private final Button browseDirButton = new Button("Browse");
    private final Button listenButton    = new Button("Start listening");
    private final Button stopButton      = new Button("Stop");

    private Runnable onListen;
    private Runnable onStop;
    private Runnable onBrowse;
    private Runnable onClear;

    private final Stage stage;

    public ReceiverUI(Stage stage) {
        this.stage = stage;
        Scene scene = new Scene(buildLayout(), 520, 390);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        stage.setScene(scene);
        stage.setTitle("RBUDP Receiver");
        wireButtons();
    }

    private VBox buildLayout() {
        Label title    = new Label("Receive a file");
        title.getStyleClass().add("title");
        Label subtitle = new Label("Waits for the sender, then saves the incoming file to your folder.");
        subtitle.getStyleClass().add("subtitle");

        // Save dir row
        saveDirField.setEditable(false);
        HBox.setHgrow(saveDirField, Priority.ALWAYS);
        HBox dirRow = new HBox(8, saveDirField, browseDirButton);

        portField.setPrefWidth(110);
        progressBar.setMaxWidth(Double.MAX_VALUE);

        // Status message: always reserves its height so the layout doesn't jump when text appears
        statusLabel.setMaxWidth(Double.MAX_VALUE);
        statusLabel.setMinHeight(20);
        statusLabel.getStyleClass().add("ok-label");

        // Buttons
        stopButton.getStyleClass().add("ghost-danger");
        stopButton.setDisable(true);
        listenButton.getStyleClass().add("primary");
        HBox btnRow = new HBox(8, stopButton, listenButton);
        btnRow.setAlignment(Pos.CENTER_RIGHT);

        Region spacer = new Region();
        VBox.setVgrow(spacer, Priority.ALWAYS);

        VBox card = new VBox(14,
                title, subtitle,
                fieldGroup("SAVE FOLDER", dirRow),
                fieldGroup("UDP PORT", portField),
                fieldGroup("PROGRESS", progressBar),
                statusLabel,
                spacer,
                btnRow);
        card.setPadding(new Insets(26));
        return card;
    }

    /** Small label above a control. */
    private VBox fieldGroup(String caption, javafx.scene.Node control) {
        Label l = new Label(caption);
        l.getStyleClass().add("field-label");
        return new VBox(6, l, control);
    }

    private void wireButtons() {
        listenButton.setOnAction(e ->    { if (onListen != null) onListen.run(); });
        stopButton.setOnAction(e ->      { if (onStop   != null) onStop.run();   });
        browseDirButton.setOnAction(e -> { if (onBrowse != null) onBrowse.run(); });
    }

    public void setOnListen(Runnable r) { onListen = r; }
    public void setOnStop(Runnable r)   { onStop   = r; }
    public void setOnBrowse(Runnable r) { onBrowse = r; }
    public void setOnClear(Runnable r)  { onClear  = r; }

    public String openFolderChooser() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("Choose Save Folder");
        dc.setInitialDirectory(new File(System.getProperty("user.home")));
        File dir = dc.showDialog(stage);
        return dir != null ? dir.getAbsolutePath() : null;
    }

    /** Shows a green success message when file is saved. */
    public void showSaveSuccess(String filePath) {
        statusLabel.setText("✓  File saved successfully");

        PauseTransition pause = new PauseTransition(Duration.seconds(3));
        pause.setOnFinished(event -> statusLabel.setText("")); // clear text after 3s
        pause.play();
    }

    /** Resets the status message when listening starts again. */
    public void clearStatus() {
        statusLabel.setText("");
    }

    public void setProgress(double v)         { progressBar.setProgress(v); }
    public void setSaveDirectory(String d)    { saveDirField.setText(d); }
    public void setListenEnabled(boolean b)   { listenButton.setDisable(!b); }
    public void setStopEnabled(boolean b)     { stopButton.setDisable(!b); }

    public String getPort()          { return portField.getText().trim(); }
    public String getSaveDirectory() { return saveDirField.getText().trim(); }

    // kept so ReceiverController still compiles without changes
    public void log(String msg)                { System.out.println(msg); }
    public void clearLog()                     {}
    public void setPacketCount(int a, int b)   {}
    public void setThroughput(String t)        {}
    public void setElapsed(String t)           {}
    public void setStatus(String t, boolean b) {}
    public void showIntegrityResult(boolean b) {}
}
