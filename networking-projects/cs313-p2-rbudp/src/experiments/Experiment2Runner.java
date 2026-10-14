package experiments;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.concurrent.CountDownLatch;

import client.Sender;
import server.RBUDPReceiver;

/**
 * Runner for Experiment 2 - Transfer Rate
 * Modified runner from Experiment 3 to bypass UI
 */
public class Experiment2Runner {
    public static void main(String[] args) throws Exception {
        // 1. Create a 52MB .txt file. 
        int fileSizeBytes = 50 * 1024 * 1024; 
        File testFile = new File("exp2_test_file.txt"); // Switched to .txt
        System.out.println("Generating 52MB test .txt file...");
        createDummyTextFile(testFile, fileSizeBytes);

        // 2. Setup the save directory
        File saveDir = new File("experiment_output");
        if (!saveDir.exists()) saveDir.mkdir();

        // Base port from which each trial's port will be calculated
        int basePort = 9000;

        System.out.println("\nStarting Experiment 2: Trial & Transfer Rate");
        System.out.println("--------------------------------------------------");
        System.out.printf("%-15s | %-20s\n", "Trial", "Transfer Rate (MBps)");
        System.out.println("--------------------------------------------------");

        for (int i = 1; i <=15; i++) {
            int port = basePort + i;
            
            CountDownLatch receiverFinishedLatch = new CountDownLatch(1);
            
            // --- START RECEIVER ---
            RBUDPReceiver receiver = new RBUDPReceiver();
            receiver.startListening(port, saveDir.getAbsolutePath(), 
                (received, total) -> { /* Ignore progress */ }, 
                (filePath, status) -> { 
                    receiverFinishedLatch.countDown(); // Receiver is done!
                }
            );
            
            Thread.sleep(500);

            // --- START SENDER ---
            Sender sender = new Sender("localhost", port, port);
            
            long startTime = System.nanoTime();
            
            // WORKAROUND: Run Sender in a background thread so it doesn't freeze the runner 
            // when the Receiver forgets to send the final confirmation.
            Thread senderThread = new Thread(() -> {
                try {
                    sender.sendFile(testFile);
                } catch (Exception e) {
                    // Suppress the expected connection reset error when we kill the socket
                }
            });
            senderThread.start();
            
            // Wait ONLY for the Receiver to finish saving the .txt file
            receiverFinishedLatch.await();
            
            long endTime = System.nanoTime();
            double durationNanoSec = endTime - startTime;
            double transferRate = (fileSizeBytes * 1000) / durationNanoSec;
            
            System.out.printf("%-15d | %-20f\n", i, transferRate);
            
            // WORKAROUND: The Receiver is done, so we violently kill the sockets.
            // This severs the TCP connection, forcing the hung Sender thread to die cleanly.
            receiver.stopListening();
            senderThread.interrupt();
            
            Thread.sleep(500); 
        }

        System.out.println("--------------------------------------------------");
        System.out.println("Experiment 2 completed.");
        
        // Cleanup the dummy text file
        testFile.delete();
        
        System.exit(0); 
    }

    /**
     * Helper method to generate a .txt file filled with valid string data.
     */
    private static void createDummyTextFile(File file, int sizeBytes) throws Exception {
        try (PrintWriter writer = new PrintWriter(new FileWriter(file))) {
            String payload = "This is a test line for the RBUDP networking experiment. It ensures the file is valid text.\n";
            int currentSize = 0;
            while (currentSize < sizeBytes) {
                writer.print(payload);
                currentSize += payload.length();
            }
        }
    }
}
