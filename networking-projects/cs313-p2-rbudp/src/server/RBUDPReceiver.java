package server;

import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.net.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;
import shared.Packet;

public class RBUDPReceiver {

    private AtomicBoolean isRunning = new AtomicBoolean(false);
    private ServerSocket tcpServerSocket;
    private DatagramSocket udpSocket;
    // *************************************************************************
    // EXPERIMENT 4 CODE
    // private int socketBufferSize = Integer.MAX_VALUE;
    // private int totalDrops = 0;

    // public void setSocketBufferSize(int size) {
    //     this.socketBufferSize = size;
    // }

    // public int getDroppedPackets() {
    // return totalDrops;
    // }
    // *************************************************************************
    
    public void startListening (int port, String saveDir, BiConsumer<Integer, Integer> onProgress, BiConsumer<String, String> onComplete) {
        isRunning.set(true);

        new Thread(() -> {
            try {
                tcpServerSocket = new ServerSocket(port);
                // *************************************************************************
                // EXPERIMENT 4 CODE
                // tcpServerSocket.setReceiveBufferSize(socketBufferSize);
                // *************************************************************************

                udpSocket = new DatagramSocket(port);
                // *************************************************************************
                // EXPERIMENT 4 CODE
                // udpSocket.setReceiveBufferSize(socketBufferSize);
                // *************************************************************************

                System.out.println("Reciever is listening on port : " + port);

                Socket tcpSocket = tcpServerSocket.accept();
                System.out.println("Sender has been connected.");

                ObjectInputStream in = new ObjectInputStream(tcpSocket.getInputStream());
                ObjectOutputStream out = new ObjectOutputStream(tcpSocket.getOutputStream());

                int totalPackets = in.readInt();
                System.out.println("any Expecting " + totalPackets + "packets");

                byte[][] fileChunks = new byte[totalPackets][]; //buffer
                int receivedCount = 0;

                udpSocket.setSoTimeout(420);

                while (isRunning.get() && receivedCount < totalPackets) {
                    try {
                        byte[] receivedData = new byte[8192];
                        DatagramPacket dp = new DatagramPacket(receivedData, receivedData.length);
                        udpSocket.receive(dp);

                        java.io.ByteArrayInputStream rawDataStream = new java.io.ByteArrayInputStream(dp.getData(), 0, dp.getLength());
                        ObjectInputStream packetIn = new ObjectInputStream(rawDataStream);
                        Packet packet = (Packet) packetIn.readObject();

                        int sequenceNumber = packet.getSequenceNumber();

                        if (fileChunks[sequenceNumber] == null) {
                           fileChunks[sequenceNumber] = packet.getData();
                           receivedCount++;

                            if (receivedCount % 10 == 0 || receivedCount == totalPackets || receivedCount == 1) {
                                onProgress.accept(receivedCount, totalPackets);
                            }

                        }

                    } catch (SocketTimeoutException e) {
                        if (tcpSocket.getInputStream().available() > 0) {
                            in.readUTF();

                            java.util.List<Integer> missingID = new java.util.ArrayList<>();

                            for (int i = 0; i < totalPackets; i++) {
                                if (fileChunks[i] == null) {
                                    missingID.add(i);

                                }
                            }
                            // *************************************************************************
                            // EXPERIMENT 4 CODE
                            // totalDrops += missingID.size();
                            // *************************************************************************
                            
                            if (missingID.isEmpty()) {
                                out.writeObject("ALL_RECEIVED");
                            } else {
                                out.writeObject(missingID);
                            }
                            out.flush();
                        }
                    }
                }
                System.out.println("All packets received.");
                System.out.println("saving file...");

                java.io.File outputFile = new java.io.File(saveDir, "recieved_file.dat");

                try (java.io.FileOutputStream fileWriter = new java.io.FileOutputStream(outputFile)) {
                    for (byte[] chunk : fileChunks) {
                        fileWriter.write(chunk);
                    }
                }
                onComplete.accept(outputFile.getAbsolutePath(), "pending");
                out.writeObject("ALL_RECEIVED");
                out.flush();
            } catch (Exception e) {
                if (isRunning.get()) {
                    System.err.println(e.getMessage());
                }
            } finally {
                stopListening();
            }
        }).start();
    }

    public void stopListening() {
        isRunning.set(false);
        try {
            if (tcpServerSocket != null && !tcpServerSocket.isClosed()) {
                tcpServerSocket.close();
            }
            if (udpSocket != null && !udpSocket.isClosed()) {
                udpSocket.close();
            }
        } catch (IOException e) {
                System.err.println("ERROR closing sockets.");
        } 
    }
    
}