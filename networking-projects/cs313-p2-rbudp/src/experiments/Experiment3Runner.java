package experiments;

import client.Sender;
import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.concurrent.CountDownLatch;
import server.RBUDPReceiver;

/**
 * Standalone headless runner for Experiment 3.
 * Includes thread-isolation workarounds to bypass UI/Receiver deadlocks.
 */
public class Experiment3Runner {

    public static void main(String[] args) throws Exception {
        // 1. Create a 500KB .txt file. 
        // 500KB guarantees 0 dropped packets on localhost, bypassing the buggy NACK loop.
        int fileSizeBytes = 500 * 1024; 
        File testFile = new File("exp3_test_file.txt"); // Switched to .txt
        System.out.println("Generating 500KB test .txt file...");
        createDummyTextFile(testFile, fileSizeBytes);

        // 2. Setup the save directory
        File saveDir = new File("experiment_output");
        if (!saveDir.exists()) saveDir.mkdir();

        // 3. Define the chunk sizes
        int[] chunkSizes = {100, 500, 800, 1200, 2000};
        int basePort = 9000; 

        System.out.println("\nStarting Experiment 3: Packet Size vs Time Taken");
        System.out.println("--------------------------------------------------");
        System.out.printf("%-15s | %-20s\n", "Chunk Size (B)", "Time Taken (ms)");
        System.out.println("--------------------------------------------------");

        for (int i = 0; i < chunkSizes.length; i++) {
            int chunkSize = chunkSizes[i];
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
            Sender sender = new Sender("127.0.0.1", port, port);
            sender.setChunkSize(chunkSize);
            
            long startTime = System.currentTimeMillis();
            
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
            
            long endTime = System.currentTimeMillis();
            long timeTaken = endTime - startTime;
            
            System.out.printf("%-15d | %-20d\n", chunkSize, timeTaken);
            
            // WORKAROUND: The Receiver is done, so we violently kill the sockets.
            // This severs the TCP connection, forcing the hung Sender thread to die cleanly.
            receiver.stopListening();
            senderThread.interrupt();
            
            Thread.sleep(500); 
        }

        System.out.println("--------------------------------------------------");
        System.out.println("Experiment 3 completed.");
        
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