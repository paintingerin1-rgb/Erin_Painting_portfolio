package client.ui;

import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.stage.DirectoryChooser;
import javafx.stage.Stage;
import javafx.scene.control.ListCell;

import java.io.File;
import java.util.List;

/**
 * Controller for the main application window.
 * Handles searching, file transfers, folder sharing,
 * and communication between the UI and networking layer.
 */
public class MainController {

    private client.client networkClient;

    // Used for Experiment 1 timing measurements
    private long searchStartTime;

    /**
     * Links the networking client to this controller.
     */
    public void setClient(client.client networkClient) {
        this.networkClient = networkClient;
    }

    // ── FXML component bindings ──────────────────────────────────
    @FXML private Label    usernameBadge;
    @FXML private Label    statusDotLabel;
    @FXML private Button   disconnectButton;
    @FXML private Label    sharedFolderLabel;
    @FXML private TextField searchField;
    @FXML private Label    resultsCountLabel;
    @FXML private ListView<String> resultsList;
    @FXML private VBox     transferPanel;
    @FXML private Label    transferTypeLabel;
    @FXML private Label    transferFilenameLabel;
    @FXML private Label    transferPercentLabel;
    @FXML private ProgressBar transferProgressBar;
    @FXML private Button   pauseResumeButton;

    // ── Application state ────────────────────────────────────────
    private String  currentUsername;
    private boolean isPaused = false;

    /**
     * Initializes the user interface after login.
     * Also configures the search results list and download buttons.
     */
    public void initUser(String username) {

        this.currentUsername = username;
        usernameBadge.setText("@" + username);

        resultsList.setCellFactory(lv -> new ListCell<String>() {

            private final Label  nameLabel = new Label();
            private final Button dlBtn     = new Button("Download");
            private final HBox   row       = new HBox(10, nameLabel, dlBtn);

            {
                HBox.setHgrow(nameLabel, Priority.ALWAYS);

                nameLabel.setMaxWidth(Double.MAX_VALUE);
                dlBtn.getStyleClass().addAll("primary", "small");

                row.setStyle("-fx-alignment: CENTER_LEFT;");

                // Request file download when button is pressed
                dlBtn.setOnAction(e -> {

                    String item = getItem();

                    if (item == null) return;

                    dlBtn.setDisable(true);
                    dlBtn.setText("Requested…");

                    networkClient.requestDownload(item);
                });
            }

            @Override
            protected void updateItem(String item, boolean empty) {

                super.updateItem(item, empty);

                if (empty || item == null) {
                    setGraphic(null);
                } else {
                    nameLabel.setText(item);

                    dlBtn.setDisable(false);
                    dlBtn.setText("Download");

                    setGraphic(row);
                }
            }
        });
    }

    // ── Shared folder selection ──────────────────────────────────

    /**
     * Opens a directory chooser and sets the selected
     * folder as the shared directory.
     */
    @FXML
    private void handleChooseFolder() {

        DirectoryChooser chooser = new DirectoryChooser();

        chooser.setTitle("Select folder to share");

        File dir = chooser.showDialog(
            sharedFolderLabel.getScene().getWindow()
        );

        if (dir == null) return;

        sharedFolderLabel.setText(dir.getAbsolutePath());

        networkClient.setSharedDirectory(dir);
    }

    // ── Search handling ──────────────────────────────────────────

    /**
     * Sends a search request to the network using the entered query.
     */
    @FXML
    private void handleSearch() {

        String query = searchField.getText().trim();

        if (query.isEmpty()) return;

        resultsList.getItems().clear();

        resultsCountLabel.setText("Searching network...");

        // Start timing for experiment measurements
        searchStartTime = System.currentTimeMillis();

        networkClient.sendSearchRequest(query);
    }

    /**
     * Updates the search results list when results are received.
     */
    public void onSearchResults(List<String> results) {

        // Measure search response time
        long elapsed = System.currentTimeMillis() - searchStartTime;

        /* EXPERIMENT 1
        System.out.println(
            "[EXPERIMENT] Files in list: " + results.size()
            + " | Response time: " + elapsed + " ms"
        );
        */

        resultsList.getItems().setAll(results);

        int n = results.size();

        resultsCountLabel.setText(
            n == 0
                ? "No results found."
                : n + " result" + (n == 1 ? "" : "s") + " found"
        );
    }

    // ── Transfer progress updates ────────────────────────────────

    /**
     * Updates the transfer progress panel during uploads or downloads.
     */
    public void updateTransferProgress(
        String filename,
        double progress,
        boolean isDownload
    ) {

        transferPanel.setVisible(true);
        transferPanel.setManaged(true);

        transferTypeLabel.setText(
            isDownload ? "Downloading" : "Uploading"
        );

        transferFilenameLabel.setText(filename);

        transferProgressBar.setProgress(progress);

        transferPercentLabel.setText(
            String.format("%.0f%%", progress * 100)
        );

        // Disable pause button when transfer completes
        if (progress >= 1.0) {

            transferPercentLabel.setText("Done ✓");

            pauseResumeButton.setDisable(true);

        } else {

            pauseResumeButton.setDisable(!isDownload);
        }
    }

    // ── Pause and resume handling ────────────────────────────────

    /**
     * Pauses or resumes the current file transfer.
     */
    @FXML
    private void handlePauseResume() {

        isPaused = !isPaused;

        pauseResumeButton.setText(
            isPaused ? "Resume" : "Pause"
        );

        // Inform the transfer engine of the new state
        if (networkClient != null && networkClient.p2pEngine != null) {

            networkClient.p2pEngine.setPaused(isPaused);
        }
    }

    // ── Disconnect handling ──────────────────────────────────────

    /**
     * Disconnects the client and returns the user
     * to the login screen.
     */
    @FXML
    private void handleDisconnect() {

        if (networkClient != null) {
            networkClient.disconnect();
        }

        try {

            FXMLLoader loader = new FXMLLoader(
                getClass().getResource("/client/ui/LoginView.fxml")
            );

            Parent root = loader.load();

            Stage stage = (Stage)
                disconnectButton.getScene().getWindow();

            stage.setScene(new Scene(root, 440, 500));

            stage.setTitle("FileShare");

            stage.setResizable(false);

        } catch (Exception e) {

            e.printStackTrace();
        }
    }

    /**
     * Displays an alert if the server disconnects unexpectedly.
     * The application closes after the user acknowledges the alert.
     */
    public void showServerDisconnectAlert() {

        Platform.runLater(() -> {

            Alert alert = new Alert(Alert.AlertType.ERROR);

            alert.setTitle("Connection Lost");

            alert.setHeaderText("Server Offline");

            alert.setContentText(
                "The central server has gone offline. " +
                "The application will now close."
            );

            // Wait for the user to acknowledge the alert
            alert.showAndWait();

            if (networkClient != null) {
                networkClient.disconnect();
            }

            Platform.exit();

            System.exit(0);
        });
    }
}