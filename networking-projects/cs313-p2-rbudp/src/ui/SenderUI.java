package ui;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.FileChooser;
import javafx.stage.Stage;
import java.io.File;

/**
 * Sender window for RBUDP: pick a file, point at the receiver, choose a packet size, send.
 * Styling lives in theme.css; this class only builds the layout.
 */
public class SenderUI {

    private final TextField filePathField   = new TextField();
    private final TextField hostField       = new TextField();
    private final TextField portField       = new TextField("9876");
    private final TextField packetSizeField = new TextField("1400");

    private final ProgressBar progressBar = new ProgressBar(0);

    private final Button browseButton = new Button("Browse");
    private final Button sendButton   = new Button("Send file");
    private final Button cancelButton = new Button("Cancel");

    private Runnable onBrowse;
    private Runnable onSend;
    private Runnable onCancel;
    private Runnable onClear;

    private final Stage stage;

    public SenderUI(Stage stage) {
        this.stage = stage;
        Scene scene = new Scene(buildLayout(), 540, 400);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        stage.setScene(scene);
        stage.setTitle("RBUDP Sender");
        wireButtons();
    }

    private VBox buildLayout() {
        Label title    = new Label("Send a file");
        title.getStyleClass().add("title");
        Label subtitle = new Label("UDP blasts the data, TCP mops up whatever got lost.");
        subtitle.getStyleClass().add("subtitle");

        // File row
        filePathField.setEditable(false);
        filePathField.setPromptText("No file selected");
        HBox.setHgrow(filePathField, Priority.ALWAYS);
        HBox fileRow = new HBox(8, filePathField, browseButton);

        // Receiver address
        hostField.setPromptText("Receiver IP (e.g. TailScale address)");
        HBox.setHgrow(hostField, Priority.ALWAYS);

        portField.setPrefWidth(90);
        packetSizeField.setPrefWidth(130);

        VBox hostBox   = fieldGroup("RECEIVER ADDRESS", hostField);
        VBox portBox   = fieldGroup("UDP PORT", portField);
        VBox packetBox = fieldGroup("PACKET SIZE (BYTES)", packetSizeField);
        HBox.setHgrow(hostBox, Priority.ALWAYS);
        HBox networkRow = new HBox(10, hostBox, portBox, packetBox);

        // Progress (0 when idle / starting, 1 when the transfer completes)
        progressBar.setMaxWidth(Double.MAX_VALUE);

        // Buttons
        cancelButton.getStyleClass().add("ghost-danger");
        cancelButton.setDisable(true);
        sendButton.getStyleClass().add("primary");
        HBox btnRow = new HBox(8, cancelButton, sendButton);
        btnRow.setAlignment(Pos.CENTER_RIGHT);

        Region spacer = new Region();
        VBox.setVgrow(spacer, Priority.ALWAYS);

        VBox card = new VBox(14,
                title, subtitle,
                fieldGroup("FILE", fileRow),
                networkRow,
                fieldGroup("PROGRESS", progressBar),
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
        browseButton.setOnAction(e -> { if (onBrowse != null) onBrowse.run(); });
        sendButton.setOnAction(e ->   { if (onSend   != null) onSend.run();   });
        cancelButton.setOnAction(e -> { if (onCancel != null) onCancel.run(); });
    }

    public void setOnBrowse(Runnable r) { onBrowse = r; }
    public void setOnSend(Runnable r)   { onSend   = r; }
    public void setOnCancel(Runnable r) { onCancel = r; }
    public void setOnClear(Runnable r)  { onClear  = r; }

    public File openFileChooser() {
        FileChooser fc = new FileChooser();
        fc.setTitle("Select File to Send");
        return fc.showOpenDialog(stage);
    }

    public void setFilePath(String path)         { filePathField.setText(path); }
    public void setProgress(double v)            { progressBar.setProgress(v); }
    public void setSendEnabled(boolean b)        { sendButton.setDisable(!b); }
    public void setCancelEnabled(boolean b)      { cancelButton.setDisable(!b); }

    public String getHost()       { return hostField.getText().trim(); }
    public String getPort()       { return portField.getText().trim(); }
    public String getFilePath()   { return filePathField.getText().trim(); }
    public String getPacketSize() { return packetSizeField.getText().trim(); }

    // kept so SenderController still compiles without changes
    public void log(String msg)              { System.out.println(msg); }
    public void clearLog()                   {}
    public void setFileSize(String s)        {}
    public void setChecksum(String s)        {}
    public void setPacketCount(int a, int b) {}
    public void setThroughput(String t)      {}
    public void setElapsed(String t)         {}
}
