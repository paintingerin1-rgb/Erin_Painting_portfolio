package controllers;

import client.Sender;
import javafx.application.Platform;
import ui.SenderUI;

import java.io.File;

public class SenderController {

    private final SenderUI view; //UI reference
    private File selectedFile; 

    public SenderController(SenderUI view) {
        this.view = view;

        //link UI actions to controller methods
        view.setOnBrowse(this::handleBrowse);
        view.setOnSend(this::handleSend);
        view.setOnCancel(this::handleCancel);
        view.setOnClear(() -> view.setProgress(0));
    }

    private void handleBrowse() {
        File file = view.openFileChooser();
        if (file == null) return;

        selectedFile = file;
        view.setFilePath(file.getAbsolutePath()); //display file path in UI
        view.setProgress(0);
        System.out.println("File selected: " + file.getName());
    }

    private void handleSend() {
        if (selectedFile == null) {
            System.out.println("ERROR — no file selected.");
            return;
        }

        String host = view.getHost();
        String portStr = view.getPort();
        String sizeStr = view.getPacketSize();

        if (host.isEmpty()) {
            System.out.println("ERROR — enter a receiver IP.");
            return;
        }

        int port, packetSize;
        try {
            port = Integer.parseInt(portStr); //validate port
            packetSize = Integer.parseInt(sizeStr); //validate packet size
        } catch (NumberFormatException e) {
            System.out.println("ERROR — port and packet size must be numbers.");
            return;
        }

        //update UI state when sending starts
        view.setSendEnabled(false);
        view.setCancelEnabled(true);
        view.setProgress(0);

        final int finalPort = port;
        final int finalPacketSize = packetSize;
        /* uncomment the code to run the expirement and get rid of the text aswell.
          
        Expirement 1:TCP VS UDP

        boolean useRBUDP = false; // Toggle for expirement

        new Thread(() -> {
            try {
                System.out.println("\n--- EXPERIMENT START ---");
                System.out.println("File: " + selectedFile.getName() + " (" + selectedFile.length() + " bytes)");
                
                long startTime = System.nanoTime(); 

                Sender sender = new Sender(host, finalPort, finalPort);
                sender.setChunkSize(finalPacketSize);

                if (useRBUDP) {
                    sender.sendFile(selectedFile);
                } else {
                    sender.sendTcpBaseline(selectedFile);
                }

                long endTime = System.nanoTime();
                
                double durationSeconds = (endTime - startTime) / 1_000_000_000.0;
                double fileSizeMB = selectedFile.length() / (1024.0 * 1024.0);
                double throughput = fileSizeMB / durationSeconds;

                System.out.println("RESULTS (Copy this):");
                System.out.println("Protocol, FileSize(MB), Time(s), Throughput(MB/s)");
                System.out.println(String.format("%s, %.2f, %.4f, %.4f", 
                    useRBUDP ? "RBUDP" : "TCP", fileSizeMB, durationSeconds, throughput));
                System.out.println("--- EXPERIMENT END ---\n");

                Platform.runLater(() -> {
                    view.setProgress(1.0);
                    resetButtons();
                    System.out.println("Experiment Transfer complete.");
                });

            } catch (Exception e) {
                Platform.runLater(() -> {
                    System.out.println("Experiment Failed: " + e.getMessage());
                    resetButtons();
                });
            }
        }).start();
        */
        /*when running the expirement comment the following thread out from here -> */
        new Thread(() -> {
            try {
                Sender sender = new Sender(host, finalPort, finalPort);
                sender.setChunkSize(finalPacketSize);
                sender.sendFile(selectedFile); //sned file using RBUDP

                Platform.runLater(() -> {
                    view.setProgress(1.0); //mark progress complete
                    resetButtons();
                    System.out.println("Transfer complete.");
                });

            } catch (Exception e) {
                Platform.runLater(() -> {
                    System.out.println("ERROR — " + e.getMessage());
                    resetButtons();
                });
            }
        }).start();
        /*to here <- */
    }

    private void handleCancel() {
        resetButtons(); //reset buttons
        System.out.println("Transfer cancelled.");
    }

    private void resetButtons() {
        view.setSendEnabled(true); //enable send button
        view.setCancelEnabled(false); //disable cancel button
    }
}