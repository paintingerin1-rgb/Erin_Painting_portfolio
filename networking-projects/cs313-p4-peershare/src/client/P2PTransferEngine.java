package client;

import security.EncryptionManager;
import security.KeyHandler;
import security.EncryptedMessage;
import java.net.*;
import java.io.*;
import javax.crypto.*;
import java.security.PublicKey;
import java.util.Base64;
import java.util.Arrays;
import java.util.Random;
import javax.crypto.spec.IvParameterSpec;
import java.util.ArrayList;
import java.util.List;
import javafx.application.Platform;
import client.ui.MainController;

public class P2PTransferEngine {
    private EncryptionManager crypto;
    private String publicKeyBase64;
    private int p2pPort = 0;
    public volatile boolean isPaused = false;
    private String expectedMessageKey = null;
    private MainController controller;
    private ServerSocket activeServerSocket;
    private File sharedDirectory = new File("./shared");
    private boolean experiment2 = false;
    private boolean experiment3 = false;
    
    public void setSharedDirectory(File dir) {
        this.sharedDirectory = dir;
    }

    public void setExpectedMessageKey(String key) { 
        this.expectedMessageKey = key; 
    }
    public EncryptionManager getCrypto() { 
        return crypto; 
    }
    public void setController(MainController controller) { 
        this.controller = controller; 
    }
    public int getP2PPort() { 
        return p2pPort; 
    }

    public P2PTransferEngine() throws Exception {
        //generates RSA keypair
        this.crypto = new EncryptionManager();

        this.publicKeyBase64 = KeyHandler.publicKeyToString(crypto.getPublicKey());

        System.out.println("Security and Identity Initialized");
    }

    public void startP2PListener() {
        Thread listenThread = new Thread(() -> {
            try {
                activeServerSocket = new ServerSocket(0);
                this.p2pPort = activeServerSocket.getLocalPort();
                System.out.println("Listening for peers on port " + p2pPort);
                while (true) { 
                    Socket peerSocket = activeServerSocket.accept();
                    new Thread(() -> handleIncomingRequest(peerSocket)).start();
                } 
            } catch (IOException e) {
                System.err.println("Listener shut down.");
            }
        });
        listenThread.setDaemon(true);
        listenThread.start();
    }

    /**
     * Handle incoming connection request
     * Decrypts message-key and checks if it matches
     * Decrypts message
     * Receives File if uploader is ready to send
     */
    private void handleIncomingRequest(Socket socket) {
        try (ObjectInputStream in = new ObjectInputStream(socket.getInputStream());
            ObjectOutputStream out = new ObjectOutputStream(socket.getOutputStream())) {
            
            // recieve encrypted handshake container from peer
            EncryptedMessage encryptedMsg = (EncryptedMessage) in.readObject();
            
            //decrypte the message key using private key
            String decryptedKey = crypto.decryptMessageKey(encryptedMsg.encryptedKey);

            if (this.expectedMessageKey == null || !this.expectedMessageKey.equals(decryptedKey)) {
                System.err.println("Security ERROR: Message keys do not match! Rejecting connection.");
                return;
            }
            
            // derive AES key to unlock payload
            SecretKey aesKey = crypto.deriveAESKey(decryptedKey);

            //decrypting
            String status = crypto.decryptMessagePayload(encryptedMsg.encryptedData, aesKey, encryptedMsg.iv);

            if (status != null && status.startsWith("READY_TO_SEND:")) {

                
                String[] parts = status.split(":");
                long expectedFileSize = Long.parseLong(parts[1]);
                String incomingFileName = parts[2];
                
                System.out.println("Handshake verified with key: " + decryptedKey);
                System.out.println("Incoming file: " + incomingFileName + " (" + expectedFileSize + " bytes)");

                if (!sharedDirectory.exists()) {
                    sharedDirectory.mkdirs();
                }
            
                String savePath = new File(sharedDirectory, incomingFileName).getAbsolutePath();
                File outputFile = new File(savePath);

                long offset;
                if (outputFile.exists()) {
                    offset = outputFile.length();
                } else {
                    offset = 0;
                }
                
                out.writeObject("VERIFIED:" + offset);
                out.flush();

                recieveFile(savePath, expectedFileSize, in, aesKey, encryptedMsg.iv);
            }
        } catch (Exception e) {
            System.err.println("Handshake ERROR: " + e.getMessage());
        }
    }

    /**
     * Initiates connection with peer
     * Completes RSA/AES handshake
     * Uploads requested file
     */
    public void connectAndSendFile(String targetIp, int targetPort, String peerPublicKeyBase64, File fileToSend, String messageKey) {
        
        new Thread(() -> {
           
            try (Socket socket = new Socket(targetIp, targetPort);
                 ObjectOutputStream out = new ObjectOutputStream(socket.getOutputStream());
                 ObjectInputStream in = new ObjectInputStream(socket.getInputStream())) {

          
                System.out.println("P2P Engine: Connecting to target at " + targetIp);

                // Converting peer's key string back to a PublicKey object
                PublicKey peerPubKey = KeyHandler.stringToPublicKey(peerPublicKeyBase64);

                // Setup AES for the payload
                SecretKey aesKey = crypto.deriveAESKey(messageKey);
                IvParameterSpec iv = new IvParameterSpec(new byte[16]); 
                String ivBase64 = Base64.getEncoder().encodeToString(iv.getIV());

                long realFileSize = fileToSend.length();
                String fileName = fileToSend.getName();
                String payloadMsg = "READY_TO_SEND:" + realFileSize + ":" + fileName;

                // Encrypt both the key (with RSA) and the payload (with AES)
                String encryptedKey = crypto.encryptMessageKey(messageKey, peerPubKey);
                String encryptedPayload = crypto.encryptPayload(payloadMsg, aesKey, iv);

                // Send the handshake container
                EncryptedMessage handshake = new EncryptedMessage(encryptedKey, encryptedPayload, ivBase64);
                out.writeObject(handshake);
                out.flush();

                // Wait for downloader's verification and offset
                String response = (String) in.readObject();
                
                // Parse the "VERIFIED" response 
                if (response != null && response.startsWith("VERIFIED:")) {
                    long offset = Long.parseLong(response.split(":")[1]);
                    System.out.println("Target verified handshake. Starting transfer at byte offset: " + offset);
                    
                    // Starting Byte Stream 
                    transferFile(fileToSend, offset, out, aesKey, iv);
                } else {
                    System.err.println("P2P Engine: Handshake failed or rejected by target.");
                }

            } catch (Exception e) {
                System.err.println("Connection ERROR: " + e.getMessage());
            }
        }).start();
    }
    /**
     * Performs AES encryption on file in chunks
     * Transfers encrypted file to peer in chunks
     */
    private void transferFile(File file, long startOffset, ObjectOutputStream out, SecretKey aesKey, IvParameterSpec iv) {
        try (RandomAccessFile raf = new RandomAccessFile(file, "r")) {
            byte[] buffer = new byte[4096];
            int bytesRead;
            long totalBytesSent = startOffset;
            long fileSize = file.length();

            System.out.println("TRANSFERING: " + file.getName());

            if (startOffset > 0) {
                raf.seek(startOffset);
            }

            // Experiment 3 timer
            long totalCryptoTimeNanos = 0;
            long totalTransferStartTime = System.currentTimeMillis();

            while ((bytesRead = raf.read(buffer)) != -1) {
                byte[] actualBytes = Arrays.copyOf(buffer, bytesRead);
                String base64Chunk = Base64.getEncoder().encodeToString(actualBytes);

                long cryptoStart = System.nanoTime();
                // encrypting payload
                String encryptedChunk = crypto.encryptPayload(base64Chunk, aesKey, iv);
                totalCryptoTimeNanos += (System.nanoTime() - cryptoStart);
                out.writeObject(encryptedChunk);

                totalBytesSent += bytesRead;
                int progress = (int) (((double) totalBytesSent / fileSize) * 100);
                System.out.print("\rUploading: " + progress + "%");
                double progressDouble = (double) totalBytesSent / fileSize;

                if (controller != null) {
                    javafx.application.Platform.runLater(() -> 
                        controller.updateTransferProgress(file.getName(), progressDouble, false));
                }
            }

            if (experiment3) {
                long totalTransferTimeMs = System.currentTimeMillis() - totalTransferStartTime;
                double totalCryptoTimeMs = totalCryptoTimeNanos / 1_000_000.0;
                double percentage = (totalCryptoTimeMs / totalTransferTimeMs) * 100;

                System.out.println("\n=======================EXPERIMENT RESULTS ========================");
                System.out.println("Total Transfer Time: " + totalTransferTimeMs + " ms");
                System.out.println("Cumulative AES Time: " + String.format("%.2f", totalCryptoTimeMs) + " ms");
                System.out.println("Encryption Overhead: " + String.format("%.2f", percentage) + "%");
                System.out.println("====================================================================");
            }

            out.writeObject("EOF");
            out.flush();
            System.out.println("\nTransfer complete");
        } catch (Exception e) {
            System.err.println("ERROR: " + e.getMessage());
        }
    }

    /**
     * Receives encrypted file from peer in chunks
     * Decrypts file in chunks
     */
    private void recieveFile(String saveFilePath, long fileSize, ObjectInputStream in, SecretKey aesKey, String ivBase64) {
        long startTime = 0;
        File outputFile = new File(saveFilePath);

        long startOffset = outputFile.exists() ? outputFile.length() : 0;

        try (RandomAccessFile raf = new RandomAccessFile(outputFile, "rw")) {
            raf.seek(startOffset);
            long totalRead = startOffset; // Start tracking progress from offset

            if (startOffset > 0) {
                System.out.println("Resuming file from byte: " + startOffset);
            } else {
                System.out.println("Receiving new file . . .");
            }

            if (experiment2) {
                startTime = System.currentTimeMillis();
            }
            while (true) {
                while (isPaused) {
                    try { Thread.sleep(100); } catch (InterruptedException e) { break; }
                }

                // Read the encrypted string object sent by the uploader
                Object obj = in.readObject();
                
                if (obj instanceof String) {
                    String encryptedChunk = (String) obj;
                    
                    // Check if transfer is done
                    if (encryptedChunk.equals("EOF")) break;

                    // Decrypt the chunk and decode it from Base64 back to raw bytes
                    String base64Chunk = crypto.decryptMessagePayload(encryptedChunk, aesKey, ivBase64);
                    byte[] actualBytes = Base64.getDecoder().decode(base64Chunk);

                    raf.write(actualBytes);
                    totalRead += actualBytes.length;

                    // Update the UI progress bar
                    double progress = (double) totalRead / fileSize;
                    Platform.runLater(() -> controller.updateTransferProgress(outputFile.getName(), progress, true));
                }
            }

            if (experiment2){
                long endTime = System.currentTimeMillis();
                long durationMs = endTime - startTime;
                double durationSec = durationMs / 1000.0;

                System.out.println("\n=================================");
                System.out.println(" EXPERIMENT DATA:");
                System.out.println(" File: " + outputFile.getName());
                System.out.println(" Size: " + (fileSize / (1024 * 1024.0)) + " MB");
                System.out.println(" Time: " + durationSec + " seconds (" + durationMs + " ms)");
                System.out.println(" Speed: " + ((fileSize / 1024.0 / 1024.0) / durationSec) + " MB/s");
                System.out.println("=================================");
                }

            System.out.println("\nFile receive complete");

        } catch (Exception e) {
            System.err.println("ERROR: " + e.getMessage());
        }
    }

    /**
     * Helper method that collects files to be shared from a given directory
     */
    public List<String> getAvailableFiles(String directoryPath) {
        File dir = new File(directoryPath);
        List<String> fileNames = new ArrayList<>();
        
        // Does the path exist and is it a folder
        if (!dir.exists() || !dir.isDirectory()) {
            System.err.println("P2P Engine: Directory does not exist -> " + directoryPath);
            return fileNames; 
        }

        File[] files = dir.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isFile()) {
                    fileNames.add(file.getName());
                }
            }
        }
        return fileNames;
    }

    /**
     * Returns all exact and substring matches for the given search (queryName)
     * Used by client.java to send results to server
     */
    public List<String> searchForFile(File targetDirectory, String queryName) {
        List<String> foundFiles = new ArrayList<>();
        
        // Base case safety check
        if (targetDirectory == null || !targetDirectory.exists() || !targetDirectory.isDirectory()) {
            return foundFiles;
        }

        File[] files = targetDirectory.listFiles();
        
        if (files != null) {
            for (File file : files) {
                if (file.isDirectory()) {
                    if (file.isHidden()) continue; 
                    
                    // Add all matches from sub-folders
                    foundFiles.addAll(searchForFile(file, queryName));
                } 
                else if (file.getName().toLowerCase().contains(queryName.toLowerCase())) {
                    System.out.println("Search Hit: Found '" + queryName + "' at " + file.getAbsolutePath());
                    foundFiles.add(file.getAbsolutePath());
                }
            }
        }
        
        return foundFiles;
    }

    public String getPublicKeyBase64() {
        return publicKeyBase64;
    }

    public void setPaused(boolean paused) {
        this.isPaused = paused;
    }

    public void stopListener() {
        try {
            if (activeServerSocket != null && !activeServerSocket.isClosed()) {
                activeServerSocket.close();
            }
        } catch (IOException e) {}
    }
}
