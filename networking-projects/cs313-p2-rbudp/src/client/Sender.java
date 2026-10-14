package client;

import shared.Packet;
import java.io.*;
import java.net.*;
import java.nio.file.Files;
import java.util.*;

/**
 * Main utility: The core RBUDP Sender logic and network engine.
 * 
 * Algorithm: Manages the chunking of files, serialization of Packet objects, 
 * high-speed UDP transmission (the blast), and handles missing packet 
 * retransmission via a TCP-based NACK signaling loop.
 * 
 * Caveats and limitations: Relies heavily on the local network buffer size. 
 * If the buffer overflows during a massive blast, local packet drops will occur.
 */
public class Sender {
    private DatagramSocket udpSocket;
    private InetAddress receiverIP;
    private int udpPort;
    private int tcpPort; 
    private int chunkSize = 800; 

    /**
     * Main utility: Initializes the Sender with networking parameters.
     * 
     * Algorithm: Creates a new DatagramSocket for UDP traffic, resolves the provided 
     * remote address string into an InetAddress object, and assigns the communication ports.
     * * @param remoteAddr The IP address of the receiver.
     * @param udpPort The UDP port to send the datagram blasts to.
     * @param tcpPort The TCP port used for the signaling connection.
     * @throws Exception If socket creation fails or the IP address cannot be resolved.
     * 
     * Caveats and limitations: Requires a valid IP format. Does not verify actual 
     * remote connectivity during initialization.
     */
    public Sender(String remoteAddr, int udpPort, int tcpPort) throws Exception {
        this.udpSocket = new DatagramSocket();
        this.receiverIP = InetAddress.getByName(remoteAddr);
        this.udpPort = udpPort;
        this.tcpPort = tcpPort;
    }

    /**
     * Main utility: The primary execution flow for the RBUDP file transfer.
     * 
     * Algorithm: Reads the file into memory, calculates total required packets, 
     * establishes a TCP connection to inform the receiver of the total, executes 
     * the initial UDP blast, and enters a while-loop to handle NACK lists until 
     * the receiver confirms all packets are received.
     * * @param file The file object to be sent to the receiver.
     * @throws IOException If file reading or network stream processes fail.
     * 
     * Caveats and limitations: Loads the entire file into a byte array in memory, 
     * which may cause OutOfMemory errors for extremely large files.
     */
    public void sendFile(File file) throws IOException {
        byte[] data = Files.readAllBytes(file.toPath());

        // Ceiling division ensures that any remaining fractional bytes at the end of the file 
        // are allocated their own dedicated packet, preventing data truncation.
        int totalPackets = (int) Math.ceil((double) data.length / chunkSize);

        try (Socket tcpSocket = new Socket(receiverIP, tcpPort);
             ObjectOutputStream out = new ObjectOutputStream(tcpSocket.getOutputStream());
             ObjectInputStream in = new ObjectInputStream(tcpSocket.getInputStream())) {

            // Transmit the upper-bound limit to the receiver so it can allocate its internal tracking structures.
            out.writeInt(totalPackets);
            out.flush();

            blast(data, totalPackets);

            // Implements a Selective Repeat ARQ (Automatic Repeat reQuest) loop.
            // The loop sustains until the receiver explicitly signals a 100% integrity match.
            boolean done = false;
            while (!done) {
                // Acts as a synchronization barrier, ensuring the receiver does not prematurely 
                // calculate missing packets while the UDP blast is still in transit.
                out.writeUTF("BLAST_COMPLETE");
                out.flush();

                Object response;
                try {
                    response = in.readObject();
                } catch (ClassNotFoundException e) {
                    throw new IOException("Invalid NACK response from receiver.", e);
                }

                if (response instanceof String && response.equals("ALL_RECEIVED")) {
                    done = true;
                } else if (response instanceof List) {
                    @SuppressWarnings("unchecked")
                    List<Integer> missingIDs = (List<Integer>) response;
                    
                    if (missingIDs.isEmpty()) {
                        done = true;
                    } else {
                        retransmit(data, missingIDs, totalPackets);
                    }
                }
            }
        }
    }

    /**
     * Main utility: Transmits all packets sequentially over UDP.
     * 
     * Algorithm: Iterates from 0 to the total number of packets, invoking the 
     * sendPacket method for each sequence number. Wraps the sending mechanism 
     * in a localized try-catch to prevent single-packet failure from breaking the loop.
     * * @param data The complete file data as a byte array.
     * @param total The total number of packets that constitute the file.
     * 
     * Caveats and limitations: Blast speed is unthrottled, meaning it can easily 
     * overwhelm slower network interfaces.
     */
    private void blast(byte[] data, int total) { 
        for (int seq = 0; seq < total; seq++) {
            try {
                sendPacket(data, seq, total);
            } catch (IOException e) {
                // Localized fault tolerance: prevents a temporary local OS socket buffer overflow 
                // from aborting the entire blast sequence.
                System.err.println("Failed to send packet " + seq + " during blast: " + e.getMessage());
            }
        }
    }

    /**
     * Main utility: Resends specific missing packets requested by the receiver.
     * 
     * Algorithm: Iterates through the provided list of missing sequence IDs and 
     * invokes the sendPacket method strictly for those IDs.
     * * @param data The complete file data as a byte array.
     * @param missingIDs A list of sequence numbers dropped by the receiver.
     * @param total The total number of packets in the file.
     * 
     * Caveats and limitations: Operates exactly like the initial blast and is 
     * subject to the same potential for packet loss.
     */
    private void retransmit(byte[] data, List<Integer> missingIDs, int total) { 
        for (int seq : missingIDs) {
            try {
                sendPacket(data, seq, total);
            } catch (IOException e) {
                // Log the error, but keep the loop going for the next missing sequence number
                System.err.println("Failed to retransmit packet " + seq + ": " + e.getMessage());
            }
        }
    }

    /**
     * Main utility: Constructs, serializes, and dispatches a single RBUDP packet.
     * 
     * Algorithm: Calculates the correct byte offset based on the sequence number, 
     * copies the exact chunk of data, instantiates a shared.Packet object, serializes 
     * the object into a byte array, and sends it via the DatagramSocket.
     * * @param data The complete file data.
     * @param seq The sequence number of the current packet.
     * @param totalPackets The total number of packets (used to set the isLast flag).
     * @throws IOException If object serialization or the DatagramSocket fails.
     * 
     * Caveats and limitations: Java Object Serialization adds metadata overhead, 
     * making the final UDP payload larger than the specified chunk size.
     */
    private void sendPacket(byte[] data, int seq, int totalPackets) throws IOException {
        // Dynamic boundary calculation ensures we do not attempt to read past the end 
        // of the byte array on the final, potentially undersized packet.
        int offset = seq * chunkSize;
        int length = Math.min(chunkSize, data.length - offset);

        // Extract the specific chunk of file data
        byte[] chunk = new byte[length];
        System.arraycopy(data, offset, chunk, 0, length);

        // Determine if this is the last packet
        boolean isLast = (seq == totalPackets - 1);

        // Create the shared Packet object
        Packet rbudpPacket = new Packet(seq, chunk, isLast);

        // DatagramPackets strictly require raw byte arrays. We utilize an in-memory 
        // byte stream to capture the serialization output of the structured Java Object.
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ObjectOutputStream oos = new ObjectOutputStream(baos);
        oos.writeObject(rbudpPacket);
        oos.flush();

        byte[] packetData = baos.toByteArray();

        // Send the serialized object via DatagramPacket
        DatagramPacket udpDatagram = new DatagramPacket(packetData, packetData.length, receiverIP, udpPort);
        udpSocket.send(udpDatagram);
    }

    /**
     * Main utility: Adjusts the payload chunk size for UDP datagrams.
     * 
     * Algorithm: Reassigns the global chunkSize variable.
     * * @param size The new chunk size in bytes.
     * 
     * Caveats and limitations: Must be called before sendFile() is executed. 
     * Setting this too high will cause UDP packets to exceed the MTU limit and be dropped.
     */
    public void setChunkSize(int size) {
        this.chunkSize = size;
    }

    /**
     * Main utility: Provides a standard TCP transfer method for experimental baselines.
     * <p>
     * Algorithm: Opens a standard Socket connection to the receiver, reads the file 
     * using a FileInputStream, and writes raw bytes directly to the OutputStream.
     * * @param file The file to send over standard TCP.
     * @throws IOException If network transmission or file reading fails.
     * <p>
     * Caveats and limitations: Completely bypasses the RBUDP logic. Exists purely 
     * to gather comparative throughput metrics.
     */
    public void sendTcpBaseline(File file) throws IOException {
        try (Socket tcpSocket = new Socket(receiverIP, tcpPort);
            OutputStream out = tcpSocket.getOutputStream();
            FileInputStream fis = new FileInputStream(file)) {

            // A 4KB buffer aligns with standard page sizes in modern operating systems, 
            // optimizing the I/O throughput between the disk and the network interface.
            byte[] buffer = new byte[4096];
            int bytesRead;
            while ((bytesRead = fis.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
            }
            out.flush();
        }
    }
}