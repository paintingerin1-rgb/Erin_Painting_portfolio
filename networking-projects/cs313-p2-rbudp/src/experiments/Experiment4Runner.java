package experiments;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.CountDownLatch;

import client.Sender;
import server.RBUDPReceiver;

public class Experiment4Runner {
    private static final int FILE_SIZE = 20 * 1024 * 1024; // 20MB
    private static final int CHUNK_SIZE = 1024; // Used for both RBUDP and TCP
    private static final String FILE_NAME = "exp4_file.txt";
    private static final int[] BUFFER_SIZES_BYTES = {64*1024, 64*1024, 32*1024, 16*1024, 8*1024, 4*1024, 2*1024, 1024};
    private static int BASEPORT_TCP = 8888;
    private static int BASEPORT_RBUDP = 9000;

    public static void main(String[] args) throws Exception {
        // 1. Create a 20MB .txt file
        File testFile = new File(FILE_NAME);
        System.out.println("Generating 20MB test .txt file...");
        createDummyTextFile(testFile, FILE_SIZE);

        // 2. Setup the save directory
        File saveDir = new File("experiment4_output");
        if (!saveDir.exists()) saveDir.mkdir();

        System.out.println("\nStarting Experiment 4: Packet Loss");
        System.out.println("--------------------------------------------------");
        System.out.printf("%-15s | %-15s | %-15s | %-15s | %-15s\n", 
        "Buffer Size (B)", "Protocol", "Time (ms)", "Throughput (MB/s)", "Dropped Packets");
        System.out.println("-----------------------------------------------------");

        // Run TCP Test
        runTCPTest(saveDir, testFile);

        // Run RBUDP Test
        runRBUDPTest(saveDir, testFile);
    }

    private static void runRBUDPTest(File saveDir, File testFile) throws Exception {

        for (int i = 0; i < BUFFER_SIZES_BYTES.length; i++) {
            int port = BASEPORT_RBUDP + i;

            CountDownLatch receiverFinishedLatch = new CountDownLatch(1);
        
            // --- START RECEIVER ---
            RBUDPReceiver receiver = new RBUDPReceiver();
            // receiver.setSocketBufferSize(BUFFER_SIZES_BYTES[i]);

            receiver.startListening(port, saveDir.getAbsolutePath(), 
                (received, total) -> { /* Ignore progress */ }, 
                (filePath, status) -> { 
                    receiverFinishedLatch.countDown(); // Receiver is done!
                }
            );
            
            Thread.sleep(500);

            // --- START SENDER ---
            Sender sender = new Sender("localhost", port, port);
            sender.setChunkSize(CHUNK_SIZE);
            
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

            // Output
            double durationMillis = endTime - startTime;
            double throughPut = FILE_SIZE / (durationMillis * 1000); //MBps
            // int drops = receiver.getDroppedPackets();


            // System.out.printf("%-15d | %-15s | %-15f | %-15f | %-15d\n", 
            // BUFFER_SIZES_BYTES[i], "RBUDP", durationMillis, throughPut, drops);

            receiver.stopListening();
            senderThread.interrupt();
            
            Thread.sleep(500); 
        }
    }

    private static void runTCPTest(File saveDir, File testFile) throws Exception {
        for (int i = 0; i < BUFFER_SIZES_BYTES.length; i++) {
            int port = BASEPORT_TCP + i;
            int bufferSize = BUFFER_SIZES_BYTES[i];

            CountDownLatch receiverReady = new CountDownLatch(1);
            CountDownLatch receiverDone = new CountDownLatch(1);

            // Start receiver thread
            new Thread(() -> {
                try {
                    runTCPReceiver(port, receiverReady, bufferSize);
                    receiverDone.countDown();
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }).start();

            receiverReady.await(); // ensure receiver is listening
            
            long startTime = System.currentTimeMillis();
            runTCPSender(port, bufferSize);
            long endTime = System.currentTimeMillis();

            // Output
            double durationMillis = endTime - startTime;
            double throughPut = FILE_SIZE / (durationMillis * 1000); //MBps

            System.out.printf("%-15d | %-15s | %-15f | %-15f | -\n", 
            BUFFER_SIZES_BYTES[i], "TCP", durationMillis, throughPut);

        }
    }

    private static void runTCPReceiver(int port, CountDownLatch readySignal, int bufferSize) throws Exception {
        ServerSocket serverSocket = new ServerSocket(port);
        readySignal.countDown(); // signal that we're ready to accept
        serverSocket.setReceiveBufferSize(bufferSize);
        Socket socket = serverSocket.accept();

        FileOutputStream fos = new FileOutputStream("experiment_output_tcp");

        byte[] buffer = new byte[CHUNK_SIZE];
        int read;

        while ((read = socket.getInputStream().read(buffer)) != -1) {
            fos.write(buffer, 0, read);
        }

        fos.close();
        serverSocket.close();
    }

    private static void runTCPSender(int port, int bufferSize) throws Exception {
        Socket socket = new Socket("localhost", port);
        socket.setSendBufferSize(bufferSize);
        FileInputStream fis = new FileInputStream(FILE_NAME);

        byte[] buffer = new byte[CHUNK_SIZE];
        int read;

        while ((read = fis.read(buffer)) != -1) {
            socket.getOutputStream().write(buffer, 0, read);
        }

        fis.close();
        socket.close();
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
