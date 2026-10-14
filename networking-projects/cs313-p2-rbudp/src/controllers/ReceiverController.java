package controllers;

import javafx.application.Platform;
import server.RBUDPReceiver;
import ui.ReceiverUI;

public class ReceiverController {

    private final ReceiverUI view; //UI reference
    private final RBUDPReceiver receiver = new RBUDPReceiver(); //handles UDP receiving logic

    public ReceiverController(ReceiverUI view) {
        this.view = view;

        // UI buttons to controller methods
        view.setOnListen(this::handleListen);
        view.setOnStop(this::handleStop);
        view.setOnBrowse(this::handleBrowse);
        view.setOnClear(() -> view.setProgress(0));
    }

    private void handleListen() {
        String portStr = view.getPort(); //getting port
        String saveDir = view.getSaveDirectory(); // getting directory to save

        int port;
        try {
            port = Integer.parseInt(portStr); //validate port
        } catch (NumberFormatException e) {
            System.out.println("ERROR — port must be a number.");
            return;
        }

        //update UI state when listening starts
        view.setListenEnabled(false);
        view.setStopEnabled(true);
        view.setProgress(0);
        /*
           EXPERIMENT 1 CODE: TCP
           
           
        boolean testingTCP = true; 
        if (testingTCP) {
            System.out.println("MODE: TCP Baseline Experiment — Listening on " + port);
            runTcpBaseline(port);
            return; // Stop here so we don't start the RBUDP receiver
        }
        */
        System.out.println("Listening on port " + port + " — save folder: " + saveDir);

        receiver.startListening(
            port,
            saveDir,
            this::onProgress,
            this::onComplete
        );
    }

    // Called from receiver background thread as packets arrive
    private void onProgress(int received, int total) {
        Platform.runLater(() -> {
            double fraction = total > 0 ? (double) received / total : 0;
            view.setProgress(fraction);
        });
    }

    // Called from receiver background thread when file is fully saved
    private void onComplete(String filePath, String status) {
        Platform.runLater(() -> {
            view.setProgress(1.0);
            view.setListenEnabled(true);
            view.setStopEnabled(false);
            view.showSaveSuccess(filePath);
            System.out.println("File saved to: " + filePath);
        });
    }

    private void handleStop() {
        receiver.stopListening(); //stop receiving process
        view.setListenEnabled(true);
        view.setStopEnabled(false);
        System.out.println("Stopped listening.");
    }

    private void handleBrowse() {
        String chosen = view.openFolderChooser();
        if (chosen != null) {
            view.setSaveDirectory(chosen); //update UI with selected folder
        }
    }
    /*
       EXPERIMENT 1 CODE: TCP
      
       
    public void runTcpBaseline(int port) {
        new Thread(() -> {
            try (java.net.ServerSocket serverSocket = new java.net.ServerSocket(port);
                 java.net.Socket clientSocket = serverSocket.accept();
                 java.io.InputStream in = clientSocket.getInputStream()) {
                
                System.out.println("TCP Baseline: Sender connected.");
                byte[] buffer = new byte[8192]; 
                int bytesRead;
                while ((bytesRead = in.read(buffer)) != -1) {
                    // Just consuming the data to measure speed
                }
                System.out.println("TCP Baseline: Transfer Complete.");
                
            } catch (java.io.IOException e) {
                System.err.println("TCP Experiment Error: " + e.getMessage());
            } finally {
                Platform.runLater(() -> {
                    view.setListenEnabled(true);
                    view.setStopEnabled(false);
                });
            }
        }).start();
    }
    */
}