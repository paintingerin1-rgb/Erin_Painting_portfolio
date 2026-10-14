/************************************************************************
 *
 * 270239331 Othello
 *
 *  The communication enumes are defined in comms.h and are as follows:
 *      - GENERATE_MOVE: Referee is asking for a move to be made.
 *      - PLAY_MOVE: Referee is forwarding the opponent's move. For this engine
 *        to update the board state.
 *     - MATCH_RESET: Referee is asking for the board to be reset. Likely, for
 *        another game.
 *     - GAME_TERMINATION: Referee is asking for the game to be terminated.
 *
 ************************************************************************/
#include "comms.h"
#include <arpa/inet.h>
#include <mpi.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <limits.h>

#define BOARD_SIZE 8
#define EMPTY -1
#define BLACK 0
#define WHITE 1
#define MAX_DEPTH 4

#define MAX_MOVES 64

const char *PLAYER_NAME_LOG = "my_player.log";

// initialisation functions
void run_master(int argc, char *argv[]);
int initialise_master(int argc, char *argv[], int *my_colour, int *msg_type, FILE **fp);
int initialise_worker(int rank, FILE **fp);
void run_worker(int rank);

// board functions
void initialise_board(void);
void reset_board(FILE *fp);
void free_board(void);

// moves
void legal_moves(int *moves, int *num_moves, int player_colour);
int check_direction(int row, int col, int dx, int dy, int player, int opponent);
void make_move(int *target_board, int move, int player_colour);
void flip_direction(int *target_board, int x, int y, int dx, int dy, int my_colour);

// worker functions
void distribute_work(int *moves, int number_of_moves, int my_colour, int msg_type, FILE *fp);
int collect_worker_results(int num_workers, double timeout, int *best_move, int *best_score, FILE *fp);
void make_opponent_move(int opp_move, int my_colour, int msg_type, FILE *fp);
int generate_move(int *worker_board, int **moves, int *number_of_moves, int rank, FILE *fp);

// evaluate
void evaluate_moves(int *moves, int number_of_moves, int my_colour, int *worker_board, int *best_move, int *best_score, FILE *fp);
int minimax(int depth, int maximizingPlayer, int alpha, int beta, int *board_state, int player_colour);

// evaluation heuristics
int evaluate_board(int *board_state, int player_colour);
int evaluate_position(int *board_state, int player_colour, int opponent_colour, int total_pieces);
int evaluate_mobility(int *board_state, int player_colour, int opponent_colour);
int evaluate_stability(int *board_state, int player_colour, int opponent_colour);
int evaluate_parity(int empty_squares);

// printing functions
void print_board(FILE *);
void print_final_scores(FILE *fp);

int *board;

/**
 * Main function: initializes MPI, runs master or worker, then cleans up.
 * @param argc Argument count
 * @param argv Argument values
 * @return 0 on success, 1 on usage error
 */
int main(int argc, char *argv[])
{

#ifdef DEBUG
    fprintf(fp, "Begin the main function\n");
#endif

    fflush(stdout);
    int rank;

    if (argc != 5)
    {
        printf("Usage: %s <inetaddress> <port> <time_limit> <player_colour>\n",
               argv[0]);
        return 1;
    }

    MPI_Init(&argc, &argv);
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);

    srand(time(NULL) + rank);

    /* each process initialises their own board */
    initialise_board();

    if (rank == 0)
    {
        run_master(argc, argv);
    }
    else
    {
        run_worker(rank);
    }

    free_board();

    MPI_Finalize();
    return 0;
}

/**
 * Initialises the master process for communication with the IF wrapper and set
 * up the log file.
 * @param argc command line argument count
 * @param argv command line argument vector
 * @param time_limit time limit for the game
 * @param my_colour colour of the player
 * @param fp pointer to the log file
 * @return 1 if initialisation was successful, 0 otherwise
 */
int initialise_master(int argc, char *argv[], int *time_limit, int *my_colour,
                      FILE **fp)
{

#ifdef DEBUG
    fprintf(fp, "Begin initializing master process\n");
#endif

    unsigned long int ip = inet_addr(argv[1]);
    int port = atoi(argv[2]);
    *time_limit = atoi(argv[3]);
    *my_colour = atoi(argv[4]);

    /* open file for logging */
    *fp = fopen(PLAYER_NAME_LOG, "w");

    if (*fp == NULL)
    {
        printf("Could not open log file\n");
        return 0;
    }

    fprintf(*fp, "Initialising communication.\n");

    /* initialise comms to IF wrapper */
    if (!initialise_comms(ip, port))
    {
        printf("Could not initialise comms\n");
        return 0;
    }

#ifdef DEBUG
    fprintf(fp, "Communication initialised\n");
#endif

    fprintf(*fp, "Let the game begin...\n");
    fprintf(*fp, "My name: %s\n", PLAYER_NAME_LOG);
    fprintf(*fp, "My colour: %d\n", *my_colour);
    fprintf(*fp, "Board size: %d\n", BOARD_SIZE);
    fprintf(*fp, "Time limit: %d\n", *time_limit);
    fprintf(*fp, "-----------------------------------\n");
    print_board(*fp);

    fflush(*fp);

    return 1;
}

/**
 * Runs the master process.
 *
 * @param argc command line argument count
 * @param argv command line argument vector
 */
void run_master(int argc, char *argv[])
{
    int msg_type, time_limit, my_colour, opp_move, running;
    FILE *fp;

#ifdef DEBUG
    fprintf(fp, "Begin running master process\n");
#endif

    // initialise master process
    running = initialise_master(argc, argv, &time_limit, &my_colour, &fp);

    while (running)
    {
        msg_type = receive_message(&opp_move);

        // no message type then stop running
        if (msg_type < 0)
        {
            fprintf(fp, "Could not get referee message: %d\n", msg_type);
            fflush(fp);
            running = 0;
            continue;
        }

        // referee asking to make move
        if (msg_type == GENERATE_MOVE)
        {

#ifdef DEBUG
            fprintf(fp, "Generating move\n");
#endif

            int number_of_moves;
            int *moves = malloc(sizeof(int) * MAX_MOVES);
            if (!moves)
            {
                fprintf(fp, "Failed to allocate memory for moves.\n");
                break;
            }

            legal_moves(moves, &number_of_moves, my_colour);

            // Check if we have enough moves
            if (number_of_moves <= 0)
            {
                fprintf(fp, "\nNo legal moves, passing.\n");
                send_move("-1\n"); // Pass move
                free(moves);
                continue;
            }

            int my_move = moves[0];
            int best_score = -1000000;

            int num_workers;
            MPI_Comm_size(MPI_COMM_WORLD, &num_workers);
            num_workers--; // Exclude master process

            if (num_workers > 0)
            {
                distribute_work(moves, number_of_moves, my_colour, msg_type, fp);
                collect_worker_results(num_workers, 5.0, &my_move, &best_score, fp);
            }

            // Make the selected move
            make_move(board, my_move, my_colour);
            fprintf(fp, "\nPlacing piece in row: %d, column: %d\n",
                    my_move / BOARD_SIZE, my_move % BOARD_SIZE);

            fprintf(fp, "Board after my move:\n");
            print_board(fp);

            // Send the move to the referee
            char move_str[16];
            sprintf(move_str, "%d\n", my_move);
            send_move(move_str);
            free(moves);
        }
        else if (msg_type == PLAY_MOVE)
        {
            make_opponent_move(opp_move, my_colour, msg_type, fp);
        }
        else if (msg_type == GAME_TERMINATION)
        {
            fprintf(fp, "Game terminated.\n");

#ifdef DEBUG
            fprintf(fp, "Terminating the game\n");
#endif

            // Print final scores when game terminates
            print_final_scores(fp);
            fflush(fp);
            running = 0;
            int num_procs;
            MPI_Comm_size(MPI_COMM_WORLD, &num_procs);
            int num_workers = num_procs - 1;

            // Send termination message to all workers
            for (int i = 1; i <= num_workers; i++)
            {
                MPI_Send(&msg_type, 1, MPI_INT, i, 0, MPI_COMM_WORLD);
            }
        }
        else if (msg_type == MATCH_RESET)
        {
            int num_procs;
            MPI_Comm_size(MPI_COMM_WORLD, &num_procs);
            int num_workers = num_procs - 1;
            for (int i = 1; i <= num_workers; i++)
            {
                MPI_Send(&msg_type, 1, MPI_INT, i, 0, MPI_COMM_WORLD);
                MPI_Send(&my_colour, 1, MPI_INT, i, 0, MPI_COMM_WORLD);
            }

#ifdef DEBUG
            fprintf(fp, "Reseting the match\n");
#endif

            fprintf(fp, "Match reset.\n");
            print_final_scores(fp);

            my_colour = (my_colour + 1) % 2;
            reset_board(fp); // reset the board
        }
        else if (msg_type == UNKNOWN)
        {
            fprintf(fp, "Received unknown message type from referee.\n");
            fflush(fp);
            running = 0;
            break;
        }
    }

#ifdef DEBUG
    fprintf(fp, "ending run master\n");
#endif
}

/**
 * Initialises the worker process and sets up a log file for that specific worker.
 *
 * @param rank rank of the worker process
 * @param fp pointer to store the log file pointer
 * @return 1 if initialisation was successful, 0 otherwise
 */
int initialise_worker(int rank, FILE **fp)
{

#ifdef DEBUG
    fprintf(fp, "begin initialising worker processes\n");
#endif

    // open file for logging workers
    char log_file_name[256];
    sprintf(log_file_name, "worker%d.log", rank);

    *fp = fopen(log_file_name, "w");

    if (*fp == NULL)
    {
        printf("Worker %d could not open log file\n", rank);
        return 0;
    }

    fprintf(*fp, "Worker %d initialised.\n", rank);
    fprintf(*fp, "-----------------------------------\n");
    fflush(*fp);

    return 1;

#ifdef DEBUG
    fprintf(fp, "finished initialising worker processes\n");
#endif
}

/**
 * Runs the worker process.
 *
 * @param rank rank of the worker process
 */
void run_worker(int rank)
{
    FILE *fp = NULL;
    int running = 1;

#ifdef DEBUG
    fprintf(fp, "Begin running worker process\n");
#endif

    // Initialize the worker and create a log file
    if (!initialise_worker(rank, &fp))
    {
        printf("Worker %d failed to initialize\n", rank);
        return;
    }

    fprintf(fp, "Worker %d is running\n", rank);
    fflush(fp);

    // Worker's copy of board and moves
    int *worker_board = malloc(sizeof(int) * BOARD_SIZE * BOARD_SIZE);
    int *moves = NULL;
    int number_of_moves = 0;

    while (running)
    {
        int msg_type;
        MPI_Status status;

        // Receive message type from master
        MPI_Recv(&msg_type, 1, MPI_INT, 0, 0, MPI_COMM_WORLD, &status);

        // Process based on message type
        if (msg_type == GAME_TERMINATION)
        {
            running = 0;

#ifdef DEBUG
            fprintf(fp, "terminating worker\n");
#endif

            fprintf(fp, "Worker %d terminating\n", rank);
            fflush(fp);
        }
        else if (msg_type == GENERATE_MOVE)
        {
            generate_move(worker_board, &moves, &number_of_moves, rank, fp);
        }
        else if (msg_type == PLAY_MOVE)
        {
            int opponent_move;
            int my_colour;
            MPI_Recv(&opponent_move, 1, MPI_INT, 0, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);
            MPI_Recv(&my_colour, 1, MPI_INT, 0, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);
            MPI_Recv(worker_board, BOARD_SIZE * BOARD_SIZE, MPI_INT, 0, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);

            fprintf(fp, "Worker %d received PLAY_MOVE: opponent placed piece at [%d,%d]\n",
                    rank, opponent_move / BOARD_SIZE, opponent_move % BOARD_SIZE);

            // Apply the opponent's move to the worker's board
            if (opponent_move >= 0)
            {
                make_move(worker_board, opponent_move, (my_colour + 1) % 2);
            }
        }
        else if (msg_type == MATCH_RESET)
        {

#ifdef DEBUG
            fprintf(fp, "resetting match in worker function\n");
#endif

            // Reset the board
            memset(worker_board, EMPTY, sizeof(int) * BOARD_SIZE * BOARD_SIZE);
            reset_board(fp);

            // Receive updated color information
            int my_colour;
            MPI_Recv(&my_colour, 1, MPI_INT, 0, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);
            fprintf(fp, "Worker %d received MATCH_RESET, board reset to initial state\n", rank);
        }
    }

    // free resources
    free(worker_board);
    if (moves != NULL)
    {
        free(moves);
    }

    fclose(fp);
}

/*
 * Distributes work to worker processes.
 *
 * @param moves array of legal moves
 * @param number_of_moves number of legal moves
 * @param my_colour colour of the player
 * @param msg_type message type (typically GENERATE_MOVE)
 * @param fp file pointer for logging
 */
void distribute_work(int *moves, int number_of_moves, int my_colour, int msg_type, FILE *fp)
{
    int num_workers;

#ifdef DEBUG
    fprintf(fp, "Begin distributing work to worker processes\n");
#endif

    MPI_Comm_size(MPI_COMM_WORLD, &num_workers);
    num_workers--; // only worker prcoesses not master

    if (num_workers <= 0)
        return; // No workers available

    fprintf(fp, "\n===== Distributing work to %d workers =====\n", num_workers);

    int active_workers = (number_of_moves < num_workers) ? number_of_moves : num_workers;
    int moves_per_worker = number_of_moves / active_workers;
    int remainder = number_of_moves % active_workers;

    fprintf(fp, "Total legal moves: %d\n", number_of_moves);
    fprintf(fp, "Active workers: %d\n", active_workers);
    fprintf(fp, "Moves per worker: %d\n", moves_per_worker);
    fprintf(fp, "Remainder moves: %d\n", remainder);

    // Send the current board state to all workers
    for (int i = 1; i <= num_workers; i++)
    {
        // Send message type to worker
        MPI_Send(&msg_type, 1, MPI_INT, i, 0, MPI_COMM_WORLD);
        MPI_Send(&my_colour, 1, MPI_INT, i, 0, MPI_COMM_WORLD);
        MPI_Send(board, BOARD_SIZE * BOARD_SIZE, MPI_INT, i, 0, MPI_COMM_WORLD);

        int worker_moves_count = 0;

        // Only active workers get moves
        if (i <= active_workers)
        {

            // Calculate start and end indices for this worker
            int start_index = (i - 1) * moves_per_worker;

            // Add extra remainder moves to the first 'remainder_moves' workers
            if (i <= remainder)
            {
                start_index += (i - 1);
            }
            else
            {
                start_index += remainder;
            }

            int end_index;
            if (i <= remainder)
            {
                end_index = start_index + moves_per_worker;
            }
            else
            {
                end_index = start_index + moves_per_worker - 1;
            }

            worker_moves_count = end_index - start_index + 1;

            fprintf(fp, "Worker %d is ACTIVE and gets moves %d to %d (number of moves: %d)\n",
                    i, start_index, end_index, worker_moves_count);

// Send number of moves for this worker
#ifdef DEBUG
            fprintf(fp, "Send moves to worker processes\n");
#endif
            MPI_Send(&worker_moves_count, 1, MPI_INT, i, 0, MPI_COMM_WORLD);

            // Send the actual moves assigned to this worker
            if (worker_moves_count > 0)
            {
                MPI_Send(&moves[start_index], worker_moves_count, MPI_INT, i, 0, MPI_COMM_WORLD);
            }
        }
        else
        {
            // Inactive workers get zero moves
            fprintf(fp, "Worker %d is INACTIVE and get not moves\n", i);
            MPI_Send(&worker_moves_count, 1, MPI_INT, i, 0, MPI_COMM_WORLD);
        }

        // Send work request signal
        int signal = 1;
        MPI_Send(&signal, 1, MPI_INT, i, 0, MPI_COMM_WORLD);
    }

#ifdef DEBUG
    fprintf(fp, "End distributing work\n");
#endif
}

/*
 * Collects results from workers and selects the best move.
 *
 * @param num_workers number of worker processes
 * @param timeout maximum time to wait for worker results (in seconds)
 * @param best_move pointer to store the selected best move
 * @param best_score pointer to store the score of the best move
 * @param fp file pointer for logging
 * @return number of workers that responded with results
 */
int collect_worker_results(int num_workers, double timeout, int *best_move, int *best_score, FILE *fp)
{

#ifdef DEBUG
    fprintf(fp, "Begin collecting worker results\n");
#endif

    int *worker_moves = malloc(sizeof(int) * num_workers);
    int *worker_scores = malloc(sizeof(int) * num_workers);

    // Non-blocking receives from workers
    MPI_Request *requests = malloc(sizeof(MPI_Request) * num_workers * 2);

    // Post receives for all worker results
    for (int i = 0; i < num_workers; i++)
    {
        MPI_Irecv(&worker_moves[i], 1, MPI_INT, i + 1, 0, MPI_COMM_WORLD, &requests[i * 2]);
        MPI_Irecv(&worker_scores[i], 1, MPI_INT, i + 1, 0, MPI_COMM_WORLD, &requests[i * 2 + 1]);
    }

    double start_time = MPI_Wtime();
    int done = 0;

    // Keep checking for completed requests until timeout
    while (MPI_Wtime() - start_time < timeout && done < num_workers)
    {
        for (int i = 0; i < num_workers * 2; i += 2)
        {

            if (requests[i] == MPI_REQUEST_NULL)
            {
                // Skip requests we've already processed
                continue;
            }

            int move_flag = 0, score_flag = 0;
            int worker_number = (i / 2) + 1;

            // Check if both move and score received from this worker
            MPI_Test(&requests[i], &move_flag, MPI_STATUS_IGNORE);
            MPI_Test(&requests[i + 1], &score_flag, MPI_STATUS_IGNORE);

            if (move_flag && score_flag)
            {
                fprintf(fp, "Worker %d recommends move [%d,%d] with score: %d\n", worker_number, worker_moves[worker_number - 1] / BOARD_SIZE,
                        worker_moves[worker_number - 1] % BOARD_SIZE, worker_scores[worker_number - 1]);

                // If this is better than our current best, use it
                if (worker_scores[worker_number - 1] > *best_score ||
                    (worker_scores[worker_number - 1] == *best_score && (rand() % 2 == 0)))
                {
                    *best_score = worker_scores[worker_number - 1];
                    *best_move = worker_moves[worker_number - 1];
                }

                done++;
            }
        }
    }

    // Check for workers that didn't respond in time
    if (done < num_workers)
    {
        fprintf(fp, "Warning: Only %d out of %d workers responded within the timeout period\n",
                done, num_workers);
    }

    fprintf(fp, "===== Worker recommendations collection complete =====\n");
    fprintf(fp, "Final selected move: [%d,%d] with score %d\n",
            *best_move / BOARD_SIZE, *best_move % BOARD_SIZE, *best_score);

    // Clean up
    free(worker_moves);
    free(worker_scores);
    free(requests);

    return done;

#ifdef DEBUG
    fprintf(fp, "Done collecting worker results\n");
#endif
}

/*
 * Updates the master’s board with the opponent’s move to kepp up to date
 *
 * @param opp_move the opponent's move
 * @param my_colour our player's colour
 * @param msg_type message type
 * @param fp file pointer for logging
 */
void make_opponent_move(int opp_move, int my_colour, int msg_type, FILE *fp)
{

#ifdef DEBUG
    fprintf(fp, "Begin making opponent move\n");
#endif

    if (opp_move >= 0)
    { // Only notify about real moves, not passes
        int num_procs;
        MPI_Comm_size(MPI_COMM_WORLD, &num_procs);
        int num_workers = num_procs - 1;

        for (int i = 1; i <= num_workers; i++)
        {
            MPI_Send(&msg_type, 1, MPI_INT, i, 0, MPI_COMM_WORLD);
            MPI_Send(&opp_move, 1, MPI_INT, i, 0, MPI_COMM_WORLD);
            MPI_Send(&my_colour, 1, MPI_INT, i, 0, MPI_COMM_WORLD);
            MPI_Send(board, BOARD_SIZE * BOARD_SIZE, MPI_INT, i, 0, MPI_COMM_WORLD);
        }
    }

    if (opp_move < 0)
    {
        fprintf(fp, "\nOpponent had no moves, therefore passed.");
        return;
    }

    fprintf(fp, "\nOpponent placing piece in row: %d, column: %d\n",
            opp_move / BOARD_SIZE, opp_move % BOARD_SIZE);

    // Make the move
    make_move(board, opp_move, (my_colour + 1) % 2);

    print_board(fp);

#ifdef DEBUG
    fprintf(fp, "Done making opponent move\n");
#endif
}

/*
 * Analyze moves and find the best one in the worker process.
 *
 * @param moves array of moves to analyze
 * @param number_of_moves number of moves in the array
 * @param my_colour our player's colour
 * @param worker_board current board state
 * @param best_move pointer to store the best move
 * @param best_score pointer to store the score of the best move
 * @param fp file pointer for logging
 */
void evaluate_moves(int *moves, int number_of_moves, int my_colour,
                    int *worker_board, int *best_move, int *best_score, FILE *fp)
{

#ifdef DEBUG
    fprintf(fp, "Begin evauluating moves\n");
#endif

    if (number_of_moves <= 0)
    {
        fprintf(fp, "No legal moves available\n");
        *best_move = -1;
        *best_score = INT_MIN;
        return;
    }

    *best_move = moves[0];
    *best_score = INT_MIN;

    // Detailed scoring explanation
    fprintf(fp, "\n----- Move Scores -----\n");
    fprintf(fp, "Move    Position    Mobility    Stability    Parity    Total\n");
    fprintf(fp, "----------------------------------------------------------------\n");

    for (int i = 0; i < number_of_moves; i++)
    {
        int move = moves[i];
        int row = move / BOARD_SIZE;
        int col = move % BOARD_SIZE;

        // Create a temporary board copy
        int *temp_board = malloc(sizeof(int) * BOARD_SIZE * BOARD_SIZE);
        if (temp_board == NULL)
        {
            fprintf(fp, "Memory allocation failed in evaluate_moves\n");
            continue;
        }

        memcpy(temp_board, worker_board, sizeof(int) * BOARD_SIZE * BOARD_SIZE);

        // Make the move on the temporary board
        make_move(temp_board, move, my_colour);

        // Get opponent color
        int opp_colour = 0;
        if (my_colour == WHITE)
        {
            opp_colour = BLACK;
        }
        else if (my_colour == BLACK)
        {
            opp_colour = WHITE;
        }

        // Count total pieces to determine game phase
        int total_pieces = 0;
        for (int j = 0; j < BOARD_SIZE * BOARD_SIZE; j++)
        {
            if (temp_board[j] != EMPTY)
                total_pieces++;
        }

#ifdef DEBUG
        fprintf(fp, "Begin evaluating Heurisitics\n");
#endif

        // Calculate heuristic scores
        int position_score = evaluate_position(temp_board, my_colour, opp_colour, total_pieces);
        int mobility_score = evaluate_mobility(temp_board, my_colour, opp_colour);
        int stability_score = evaluate_stability(temp_board, my_colour, opp_colour);
        int parity_score = evaluate_parity(BOARD_SIZE * BOARD_SIZE - total_pieces);

        // minimax score
        int minimax_score = minimax(0, false, INT_MIN, INT_MAX, temp_board, my_colour);

        fprintf(fp, "[%d,%d]    %4d       %4d        %4d      %4d    %5d\n",
                row, col, position_score, mobility_score, stability_score, parity_score, minimax_score);

        // Update best move if this one is better
        if (minimax_score > *best_score)
        {
            *best_score = minimax_score;
            *best_move = move;
        }

        free(temp_board);
    }

    fprintf(fp, "\nSelected move: [%d,%d] with score: %d\n",
            *best_move / BOARD_SIZE, *best_move % BOARD_SIZE, *best_score);

#ifdef DEBUG
    fprintf(fp, "Done evaluating moves\n");
#endif
}

/*
 * Process a GENERATE_MOVE request in the worker.
 *
 * @param worker_board pointer to the worker's copy of the board
 * @param moves pointer to the moves array
 * @param number_of_moves pointer to store the number of moves
 * @param rank worker rank
 * @param fp file pointer for logging
 * @return 1 if processing was successful, 0 otherwise
 */
int generate_move(int *worker_board, int **moves, int *number_of_moves,
                  int rank, FILE *fp)
{

#ifdef DEBUG
    fprintf(fp, "Begin generating moves\n");
#endif

    int my_colour;
    fprintf(fp, "\n\nWorker %d received GENERATE_MOVE request\n", rank);

    MPI_Recv(&my_colour, 1, MPI_INT, 0, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);
    MPI_Recv(worker_board, BOARD_SIZE * BOARD_SIZE, MPI_INT, 0, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);

    // Receive the number of possible moves
    MPI_Recv(number_of_moves, 1, MPI_INT, 0, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);
    fprintf(fp, "Worker %d received number of moves: %d\n", rank, *number_of_moves);

    int best_move = -1;
    int best_score = -1000000;

    // Only receive moves if there are any
    if (*number_of_moves > 0)
    {
        if (*moves != NULL)
        {
            free(*moves);
        }

        *moves = malloc(sizeof(int) * (*number_of_moves));
        if (*moves == NULL)
        {
            fprintf(fp, "Worker %d: Failed to allocate memory for moves\n", rank);
            return 0;
        }

#ifdef DEBUG
        fprintf(fp, "Worker process recieved move\n");
#endif
        MPI_Recv(*moves, *number_of_moves, MPI_INT, 0, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);

        fprintf(fp, "Worker %d received moves: ", rank);
        for (int i = 0; i < *number_of_moves; i++)
        {
            fprintf(fp, "[%d,%d] ", (*moves)[i] / BOARD_SIZE, (*moves)[i] % BOARD_SIZE);
        }
        fprintf(fp, "\n");

        // Analyze the moves
        evaluate_moves(*moves, *number_of_moves, my_colour, worker_board, &best_move, &best_score, fp);
    }
    else
    {
        fprintf(fp, "Worker %d: No legal moves available\n", rank);
        best_move = -1;
        best_score = -100000;
    }

    int signal;
    MPI_Recv(&signal, 1, MPI_INT, 0, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);

    // Send back result to master
    MPI_Send(&best_move, 1, MPI_INT, 0, 0, MPI_COMM_WORLD);
    MPI_Send(&best_score, 1, MPI_INT, 0, 0, MPI_COMM_WORLD);

    fprintf(fp, "Worker %d sent results back to master\n", rank);

    return 1;

#ifdef DEBUG
    fprintf(fp, "Done generating moves\n");
#endif
}

/**
 * Resets the board to the initial state.
 *
 * @param fp pointer to the log file
 */
void reset_board(FILE *fp)
{
#ifdef DEBUG
    fprintf(fp, "Board is being reset\n");
#endif
    int mid = BOARD_SIZE / 2;
    memset(board, EMPTY, sizeof(int) * BOARD_SIZE * BOARD_SIZE);

    // Set up the initial four pieces in the middle
    board[mid * BOARD_SIZE + mid] = WHITE;
    board[(mid - 1) * BOARD_SIZE + (mid - 1)] = WHITE;
    board[mid * BOARD_SIZE + (mid - 1)] = BLACK;
    board[(mid - 1) * BOARD_SIZE + mid] = BLACK;

    fprintf(fp, "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");
    fprintf(fp, "~~~~~~~~~~~~~ NEW MATCH ~~~~~~~~~~~~\n");
    fprintf(fp, "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");

    fprintf(fp, "New board state:\n");
}

/*
 * flips opponents pieces in a direction
 *
 * @param target_board Pointer to the board array representing the game state.
 * @param x The x-coordinate (row) of the piece just placed.
 * @param y The y-coordinate (column) of the piece just placed.
 * @param dx The x-direction increment (-1, 0, or 1) to move along the board.
 * @param dy The y-direction increment (-1, 0, or 1) to move along the board.
 * @param my_colour The color of the current player (BLACK or WHITE).
 */
void flip_direction(int *target_board, int x, int y, int dx, int dy, int my_colour)
{
#ifdef DEBUG
    fprintf(fp, "opponents pieces are being flipped\n");
#endif
    int i = x + dx;
    int j = y + dy;

    // Move along the direction and flip pieces until we hit a piece of my_colour
    while (i >= 0 && i < BOARD_SIZE && j >= 0 && j < BOARD_SIZE &&
           target_board[i * BOARD_SIZE + j] != my_colour)
    {
        target_board[i * BOARD_SIZE + j] = my_colour;
        i += dx;
        j += dy;
    }
}

/**
 * Makes a move on the given board
 *
 * @param target_board current state of the Othello board.
 * @param move where the player wants to place their piece
 * @param player_colour The color of the current player
 */
void make_move(int *target_board, int move, int player_colour)
{

#ifdef DEBUG
    fprintf(fp, "Begin making move\n");
#endif
    int row = move / BOARD_SIZE;
    int col = move % BOARD_SIZE;
    int opp_colour = (player_colour == WHITE) ? BLACK : WHITE;
    target_board[row * BOARD_SIZE + col] = player_colour;

    for (int dx = -1; dx <= 1; dx++)
    {
        for (int dy = -1; dy <= 1; dy++)
        {
            if (dx == 0 && dy == 0)
                continue;

            int i = row + dx;
            int j = col + dy;
            int found_opp = 0;

            while (i >= 0 && i < BOARD_SIZE && j >= 0 && j < BOARD_SIZE)
            {
                if (target_board[i * BOARD_SIZE + j] == opp_colour)
                {
                    found_opp = 1;
                    i += dx;
                    j += dy;
                }
                else if (target_board[i * BOARD_SIZE + j] == player_colour && found_opp)
                {
                    flip_direction(target_board, row, col, dx, dy, player_colour);
                    break;
                }
                else
                {
                    break;
                }
            }
        }
    }
#ifdef DEBUG
    fprintf(fp, "done making move\n");
#endif
}

/**
 * Checks if the given direction is valid.
 *
 * @param x x-coordinate of the piece being placed
 * @param y y-coordinate of the piece being placed
 * @param dx x-direction to check
 * @param dy y-direction to check
 * @param my_colour colour of the player
 * @param opp_colour colour of the opponent
 * @return 1 if the direction is valid, 0 otherwise
 */
int check_direction(int x, int y, int dx, int dy, int my_colour,
                    int opp_colour)
{
#ifdef DEBUG
    fprintf(fp, "Checking direction\n");
#endif
    int i = x + dx;
    int j = y + dy;
    int found_opp = 0; // Flag to check if at least one opponent piece is found

    while (i >= 0 && i < BOARD_SIZE && j >= 0 && j < BOARD_SIZE)
    {
        if (board[i * BOARD_SIZE + j] == opp_colour)
        {
            found_opp = 1;
            i += dx;
            j += dy;
        }
        else if (board[i * BOARD_SIZE + j] == my_colour && found_opp)
        {
            return 1; // Valid direction as it sandwiches opponent's pieces
        }
        else
        {
            return 0; // Either empty or own piece without sandwiching
                      // opponent's pieces
        }
    }
    return 0;
#ifdef DEBUG
    fprintf(fp, "Done checking direction\n");
#endif
}

/**
 * Gets a list of legal moves for the current board, and stores them in the
 * moves array followed by a -1. Also stores the number of legal moves in the
 * number_of_moves variable.
 *
 * What is a legal move? A legal move is a move that results in at least one of
 * the opponent's pieces being flipped. That is if there is at least one piece
 * of the opponent's colour between the piece being placed and another piece of
 * the player's colour.
 *
 * @param moves array to store the legal moves in
 * @param number_of_moves variable to store the number of legal moves in
 */
void legal_moves(int *moves, int *number_of_moves, int my_colour)
{
#ifdef DEBUG
    fprintf(fp, "getting legal moves\n");
#endif
    int opp_colour = (my_colour == WHITE) ? BLACK : WHITE;
    *number_of_moves = 0;

    for (int i = 0; i < BOARD_SIZE; i++)
    {
        for (int j = 0; j < BOARD_SIZE; j++)
        {
            if (board[i * BOARD_SIZE + j] != EMPTY)
                continue;

            int moveFound = 0; // Flag to indicate if a legal move is found for the cell

            // Check all 8 directions from the current cell
            for (int dx = -1; dx <= 1 && !moveFound; dx++)
            {
                for (int dy = -1; dy <= 1 && !moveFound; dy++)
                {
                    if (dx == 0 && dy == 0)
                        continue; // Skip checking the current cell

                    if (check_direction(i, j, dx, dy, my_colour, opp_colour))
                    {
                        moves[(*number_of_moves)++] = i * BOARD_SIZE + j;
                        moveFound = 1; // A legal move is found, no need to
                                       // check other directions
                    }
                }
            }
        }
    }

    moves[*number_of_moves] = -1; // End of moves
}

/**
 * Initialises the board for the game.
 */
void initialise_board(void)
{
#ifdef DEBUG
    fprintf(fp, "Begin initialising Board\n");
#endif
    int mid = BOARD_SIZE / 2;

    board = malloc(sizeof(int) * BOARD_SIZE * BOARD_SIZE);
    memset(board, EMPTY, sizeof(int) * BOARD_SIZE * BOARD_SIZE);

    /* plave initial pieces */
    board[mid * BOARD_SIZE + mid] = WHITE;
    board[(mid - 1) * BOARD_SIZE + (mid - 1)] = WHITE;
    board[mid * BOARD_SIZE + (mid - 1)] = BLACK;
    board[(mid - 1) * BOARD_SIZE + mid] = BLACK;
}

/**
 * Prints the board to the given file with improved aesthetics.
 *
 * @param fp pointer to the file to print to
 */
void print_board(FILE *fp)
#ifdef DEBUG
    fprintf(fp, "Printing Board\n");
#endif
{
    if (fp == NULL)
    {
        return; // File pointer is not valid
    }

    fprintf(fp, "  ");
    for (int i = 0; i < BOARD_SIZE; ++i)
    {
        fprintf(fp, "%d ", i); // Print column numbers
    }
    fprintf(fp, "\n");

    for (int i = 0; i < BOARD_SIZE; ++i)
    {
        fprintf(fp, "%d ", i); // Print row numbers
        for (int j = 0; j < BOARD_SIZE; ++j)
        {
            if (board[i * BOARD_SIZE + j] == EMPTY)
            {
                fprintf(fp, ". "); // Print a dot for empty spaces
            }
            else if (board[i * BOARD_SIZE + j] == BLACK)
            {
                fprintf(fp, "B "); // Print B for Black pieces
            }
            else if (board[i * BOARD_SIZE + j] == WHITE)
            {
                fprintf(fp, "W "); // Print W for White pieces
            }
        }
        fprintf(fp, "\n");
    }

#ifdef DEBUG
    fprintf(fp, "counting pieces to print score\n");
#endif
    int black_count = 0; // number of black pieces
    for (int i = 0; i < BOARD_SIZE * BOARD_SIZE; i++)
    {
        if (board[i] == BLACK)
        {
            black_count++;
        }
    }

    int white_count = 0; // number of white pieces
    for (int i = 0; i < BOARD_SIZE * BOARD_SIZE; i++)
    {
        if (board[i] == WHITE)
        {
            white_count++;
        }
    }

    fprintf(fp, "Current score: Black: %d, White: %d\n", black_count, white_count);
#ifdef DEBUG
    fprintf(fp, "Done printing board\n");
#endif
}

/**
 * Frees the memory allocated for the board.
 */
void free_board(void) { free(board); }

/**
 * Implements the Minimax algorithm with Alpha-Beta pruning to evaluate the best move
 * for the current player in a game of Othello.
 *
 * @param depth The current depth
 * @param maximizingPlayer is the current player is the maximizing player.
 * @param alpha The best score that the maximizing player can get
 * @param beta The best score that the minimizing player can get
 * @param board_state current state of the Othello board.
 * @param player_colour The color of the current player
 *
 * @return The score of the best move for the current player.
 */
int minimax(int depth, int max_player, int alpha, int beta, int *board_state, int player_colour)
{
#ifdef DEBUG
    fprintf(fp, "Beging minimax with Alpha Beta pruning\n");
#endif
    // Base case: reached max depth
    if (depth == MAX_DEPTH)
    {
        return evaluate_board(board_state, player_colour);
    }

    // get opponents colour
    int opp_colour = 0;
    if (player_colour == WHITE)
    {
        opp_colour = BLACK;
    }
    else if (player_colour == BLACK)
    {
        opp_colour = WHITE;
    }

    int moves[MAX_MOVES];
    int number_of_moves;

    // swap global board temporarily
    int *temp_board = board;
    board = board_state;

    // Get legal moves for current player
    int current_colour;
    if (max_player)
    {
        current_colour = player_colour;
    }
    else
    {
        current_colour = opp_colour;
    }
    legal_moves(moves, &number_of_moves, current_colour);

    // Restore global board
    board = temp_board;

    // If no legal moves (terminal state or need to pass)
    if (number_of_moves == 0)
    {
        // Check if the opponent also has no moves (game over)
        int opp_moves[MAX_MOVES];
        int opp_num_moves = 0;

        // Temporarily swap board again
        board = board_state;
        legal_moves(opp_moves, &opp_num_moves, max_player ? opp_colour : player_colour);
        board = temp_board;

        if (opp_num_moves == 0)
        {
            // Game is over
            int my_pieces = 0, opp_pieces = 0;
            for (int i = 0; i < BOARD_SIZE * BOARD_SIZE; i++)
            {
                if (board_state[i] == player_colour)
                    my_pieces++;
                else if (board_state[i] == opp_colour)
                    opp_pieces++;
            }

            int score_range = MAX_DEPTH * 10;

            // return score
            if (my_pieces > opp_pieces)
                return score_range; // Win
            else if (my_pieces < opp_pieces)
                return -score_range; // Loss
            else
                return 0; // Draw
        }
        else
        {
            // continue search with switched player
            return minimax(depth, !max_player, alpha, beta, board_state, player_colour);
        }
    }

    if (max_player)
    {
        int best_score = INT_MIN;

        for (int i = 0; i < number_of_moves; i++)
        {
            // Create a new board with the move applied
            int *new_board = malloc(sizeof(int) * BOARD_SIZE * BOARD_SIZE);
            memcpy(new_board, board_state, sizeof(int) * BOARD_SIZE * BOARD_SIZE);

            make_move(new_board, moves[i], player_colour);

            // Recursively evaluate move
            int score = minimax(depth + 1, 0, alpha, beta, new_board, player_colour);
            free(new_board);

            // Update best score
            best_score = (score > best_score) ? score : best_score;
            alpha = (alpha > best_score) ? alpha : best_score;

            // Alpha-beta pruning
            if (beta <= alpha)
                break; // prune branch
        }

        return best_score;
    }
    else
    {
        int best_score = INT_MAX;

        for (int i = 0; i < number_of_moves; i++)
        {
            // Create a new board with this move applied
            int *new_board = malloc(sizeof(int) * BOARD_SIZE * BOARD_SIZE);
            memcpy(new_board, board_state, sizeof(int) * BOARD_SIZE * BOARD_SIZE);

            make_move(new_board, moves[i], opp_colour);

            // Recursively evaluate this move
            int score = minimax(depth + 1, 1, alpha, beta, new_board, player_colour);
            free(new_board);

            // Update best score
            best_score = (score < best_score) ? score : best_score;
            beta = (beta < best_score) ? beta : best_score;

            // Alpha-beta pruning
            if (beta <= alpha)
                break;
        }

        return best_score;
    }
}

void print_final_scores(FILE *fp)
{

#ifdef DEBUG
    fprintf(fp, "Begin printing final scores \n");
#endif

    // counting black pieces
    int black_count = 0;
    for (int i = 0; i < BOARD_SIZE * BOARD_SIZE; i++)
    {
        if (board[i] == BLACK)
        {
            black_count++;
        }
    }

    // counting white pieces
    int white_count = 0;
    for (int i = 0; i < BOARD_SIZE * BOARD_SIZE; i++)
    {
        if (board[i] == WHITE)
        {
            white_count++;
        }
    }

    fprintf(fp, "\n====================================\n");
    fprintf(fp, "            GAME OVER               \n");
    fprintf(fp, "====================================\n");
    fprintf(fp, "Final board state:\n");
    print_board(fp); // print the final board

    fprintf(fp, "\nFINAL SCORES:\n");
    fprintf(fp, "Black: %d pieces \n", black_count);
    fprintf(fp, "White: %d pieces \n", white_count);

    if (black_count > white_count)
    {
        fprintf(fp, "\nBLACK WINS\n");
    }
    else if (white_count > black_count)
    {
        fprintf(fp, "\nWHITE WINS\n");
    }
    else if (black_count == white_count)
    {
        fprintf(fp, "GAME ENDED IN TIE!\n");
    }

    fprintf(fp, "====================================\n\n");
}

/**
 * Advanced board evaluation function with multiple heuristics
 * - Piece count
 * - Positional scoring (including corners, edges, X-squares, C-squares)
 * - Mobility assessment
 * - Stability analysis
 * - Game phase adaptation
 *
 * @param board_state current state of the board
 * @param player_colour player's color for whom to evaluate
 * @return evaluation score from player's perspective
 */
int evaluate_board(int *board_state, int player_colour)
{
#ifdef DEBUG
    fprintf(fp, "beging evaluating board based on heuristics\n");
#endif

    // get opponent colour
    int opponent_colour;
    if (player_colour == WHITE)
    {
        opponent_colour = BLACK;
    }
    else
    {
        opponent_colour = WHITE;
    }

    // counting black pieces
    int black_count = 0;
    for (int i = 0; i < BOARD_SIZE * BOARD_SIZE; i++)
    {
        if (board[i] == BLACK)
        {
            black_count++;
        }
    }

    // counting white pieces
    int white_count = 0;
    for (int i = 0; i < BOARD_SIZE * BOARD_SIZE; i++)
    {
        if (board[i] == WHITE)
        {
            white_count++;
        }
    }

    int total_pieces = white_count + black_count;
    int empty_squares = BOARD_SIZE * BOARD_SIZE - total_pieces;

    // Heuristic 1: Positional Scores
    int position_score = evaluate_position(board_state, player_colour, opponent_colour, total_pieces);
    // Heuristic 2: Mobility
    int mobility_score = evaluate_mobility(board_state, player_colour, opponent_colour);
    // Heuristic 3: Stability
    int stability_score = evaluate_stability(board_state, player_colour, opponent_colour);
    // Heuristic 4: Parity
    int parity_score = evaluate_parity(empty_squares);

    // Count pieces for both players
    int num_my_pieces = 0;
    int num_opponent_pieces = 0;
    for (int i = 0; i < BOARD_SIZE * BOARD_SIZE; i++)
    {
        if (board_state[i] == player_colour)
        {
            num_my_pieces++;
        }
        else if (board_state[i] == opponent_colour)
        {
            num_opponent_pieces++;
        }
    }

    // Calculate piece difference
    int piece_difference = 10 * (num_my_pieces - num_opponent_pieces) / (total_pieces > 0 ? total_pieces : 1);

    // When the game is almost over, piece difference very important
    if (empty_squares <= 2)
    {
        return 50 * (num_my_pieces - num_opponent_pieces);
    }

    // Combine all metrics without weights
    int final_score = position_score + mobility_score + stability_score + parity_score + piece_difference;
#ifdef DEBUG
    fprintf(fp, "Done evaluating heurisitic scorew\n");
#endif
    return final_score;
}

/**
 * Evaluates the position of pieces on board
 *
 * @param board_state current state of the Othello board.
 * @param player_colour The color of the player
 * @param opponent_colour The color of the opponent
 * @param total_pieces The total number of pieces on the board
 * @return An integer score representing the desirability of the current board position
 */
int evaluate_position(int *board_state, int player_colour, int opponent_colour, int total_pieces)
{
#ifdef DEBUG
    fprintf(fp, "Beging position heursitic \n");
#endif

    int score = 0;
    // positional values
    int pos_values[BOARD_SIZE][BOARD_SIZE] = {
        {100, -20, 10, 5, 5, 10, -20, 100},
        {-20, -30, 1, 1, 1, 1, -30, -20},
        {10, 1, 5, 2, 2, 5, 1, 10},
        {5, 1, 2, 1, 1, 2, 1, 5},
        {5, 1, 2, 1, 1, 2, 1, 5},
        {10, 1, 5, 2, 2, 5, 1, 10},
        {-20, -30, 1, 1, 1, 1, -30, -20},
        {100, -20, 10, 5, 5, 10, -20, 100}};

    // Adjust values based on corner occupation
    // depending on who hold a corner, moves will differ for each player and be more valuable or dangerous
    if (board_state[0] == player_colour)
    {                          // top-left corner
        pos_values[0][1] = 10; // more valueable if corner is owned
        pos_values[1][0] = 10;
        pos_values[1][1] = 5;
    }
    else if (board_state[0] == opponent_colour)
    {
        pos_values[0][1] = -10; // becomes more dangerous
        pos_values[1][0] = -10;
        pos_values[1][1] = -5;
    }

    if (board_state[7] == player_colour)
    { // top-right corner
        pos_values[0][6] = 10;
        pos_values[1][6] = 10;
        pos_values[1][7] = 5;
    }
    else if (board_state[7] == opponent_colour)
    {
        pos_values[0][6] = -10;
        pos_values[1][6] = -10;
        pos_values[1][7] = -5;
    }

    if (board_state[56] == player_colour)
    { // bottom-left corner
        pos_values[6][0] = 10;
        pos_values[6][1] = 10;
        pos_values[7][1] = 5;
    }
    else if (board_state[56] == opponent_colour)
    {
        pos_values[6][0] = -10;
        pos_values[6][1] = -10;
        pos_values[7][1] = -5;
    }

    if (board_state[63] == player_colour)
    { // bottom-right corner
        pos_values[6][7] = 10;
        pos_values[6][6] = 10;
        pos_values[7][6] = 5;
    }
    else if (board_state[63] == opponent_colour)
    {
        pos_values[6][7] = -10;
        pos_values[6][6] = -10;
        pos_values[7][6] = -5;
    }

    // Calculate score
    for (int i = 0; i < BOARD_SIZE; i++)
    {
        for (int j = 0; j < BOARD_SIZE; j++)
        {
            if (board_state[i * BOARD_SIZE + j] == player_colour)
            {
                score += pos_values[i][j];
            }
            else if (board_state[i * BOARD_SIZE + j] == opponent_colour)
            {
                score -= pos_values[i][j];
            }
        }
    }

#ifdef DEBUG
    fprintf(fp, "done evauluating position heuristic\n");
#endif
    return score;
}

/**
 * Evaluates the mobility of the players by counting the number of legal moves available to each player.
 *
 * @param board_state current state of the Othello board.
 * @param player_colour The color of the player
 * @param opponent_colour The color of the opponent
 * @return An integer score representing the mobility advantage for the player.
 */
int evaluate_mobility(int *board_state, int player_colour, int opponent_colour)
{

#ifdef DEBUG
    fprintf(fp, "Begin mobility Heurisitc\n");
#endif

    int my_moves[MAX_MOVES];
    int opponent_moves[MAX_MOVES];
    int my_move_count = 0;
    int opponent_move_count = 0;

    // We need to temporarily swap the global board to use legal_moves
    int *temp_board = board;
    board = board_state;

    legal_moves(my_moves, &my_move_count, player_colour);
    legal_moves(opponent_moves, &opponent_move_count, opponent_colour);

    // Restore global board
    board = temp_board;

    // Calculate mobility score
    int score = 0;
    if (my_move_count + opponent_move_count != 0)
    {
        score = 10 * (my_move_count - opponent_move_count) / (my_move_count + opponent_move_count);
        return score;
    }

#ifdef DEBUG
    fprintf(fp, "Finished mobility heuristic\n");
#endif
    return score;
}

/**
 * Heuristic 3: Evaluate stability - how likely pieces are to be flipped.
 *
 * @param board_state current state of the Othello board.
 * @param player_colour The color of the player
 * @param opponent_colour The color of the opponent
 *
 * @return An integer score representing the stability advantage for the player.
 */
int evaluate_stability(int *board_state, int player_colour, int opponent_colour)
{
#ifdef DEBUG
    fprintf(fp, "Begin evaluating stability heuristic\n");
#endif
    int stability_score = 0;
    int stable_pieces_player = 0;
    int stable_pieces_opponent = 0;

    // Create a stability map, where higher values mean more stable pieces
    int stability_array[BOARD_SIZE * BOARD_SIZE];
    memset(stability_array, 0, sizeof(int) * BOARD_SIZE * BOARD_SIZE);

    // Corner pieces are fully stable
    int corners[4] = {0, 7, 56, 63};
    for (int i = 0; i < 4; i++)
    {
        if (board_state[corners[i]] != EMPTY)
        {
            stability_array[corners[i]] = 2; // Fully stable
        }
    }

    // Edge pieces connected to corners can be stable
    if (board_state[0] != EMPTY)
    { // Top-left corner occupied
        int color = board_state[0];
        // Check horizontal edge from corner
        for (int j = 1; j < BOARD_SIZE; j++)
        {
            if (board_state[j] == color)
            {
                stability_array[j] = 2;
            }
            else
            {
                break;
            }
        }
        // Check vertical edge from corner
        for (int i = 1; i < BOARD_SIZE; i++)
        {
            if (board_state[i * BOARD_SIZE] == color)
            {
                stability_array[i * BOARD_SIZE] = 2;
            }
            else
            {
                break;
            }
        }
    }

    if (board_state[7] != EMPTY)
    { // Top-right corner occupied
        int color = board_state[7];
        // Check horizontal edge from corner
        for (int j = 6; j >= 0; j--)
        {
            if (board_state[j] == color)
            {
                stability_array[j] = 2;
            }
            else
            {
                break;
            }
        }
        // Check vertical edge from corner
        for (int i = 1; i < BOARD_SIZE; i++)
        {
            if (board_state[i * BOARD_SIZE + 7] == color)
            {
                stability_array[i * BOARD_SIZE + 7] = 2;
            }
            else
            {
                break;
            }
        }
    }

    if (board_state[56] != EMPTY)
    { // Bottom-left corner occupied
        int color = board_state[56];
        // Check horizontal edge from corner
        for (int j = 1; j < BOARD_SIZE; j++)
        {
            if (board_state[56 + j] == color)
            {
                stability_array[56 + j] = 2;
            }
            else
            {
                break;
            }
        }
        // Check vertical edge from corner
        for (int i = 6; i >= 0; i--)
        {
            if (board_state[i * BOARD_SIZE] == color)
            {
                stability_array[i * BOARD_SIZE] = 2;
            }
            else
            {
                break;
            }
        }
    }

    if (board_state[63] != EMPTY)
    { // Bottom-right corner occupied
        int color = board_state[63];
        // Check horizontal edge from corner
        for (int j = 6; j >= 0; j--)
        {
            if (board_state[56 + j] == color)
            {
                stability_array[56 + j] = 2;
            }
            else
            {
                break;
            }
        }
        // Check vertical edge from corner
        for (int i = 6; i >= 0; i--)
        {
            if (board_state[i * BOARD_SIZE + 7] == color)
            {
                stability_array[i * BOARD_SIZE + 7] = 2;
            }
            else
            {
                break;
            }
        }
    }

    // Semi-stable pieces (pieces surrounded on at least 3 sides)
    for (int i = 0; i < BOARD_SIZE; i++)
    {
        for (int j = 0; j < BOARD_SIZE; j++)
        {
            int index = i * BOARD_SIZE + j;
            if (board_state[index] != EMPTY && stability_array[index] == 0)
            {
                int count = 0;

                // Check all 8 directions - same as in legal moves function
                for (int dx = -1; dx <= 1; dx++)
                {
                    for (int dy = -1; dy <= 1; dy++)
                    {
                        if (dx == 0 && dy == 0)
                        {
                            continue;
                        }

                        int nx = i + dx;
                        int ny = j + dy;

                        if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE)
                        {
                            if (board_state[nx * BOARD_SIZE + ny] != EMPTY)
                            {
                                count++;
                            }
                        }
                        else
                        {
                            count++; // Count board edges as "occupied"
                        }
                    }
                }

                if (count >= 6)
                {
                    stability_array[index] = 1; // Semi-stable
                }
            }
        }
    }

    // Count stable and semi-stable pieces
    for (int i = 0; i < BOARD_SIZE * BOARD_SIZE; i++)
    {
        if (board_state[i] == player_colour)
        {
            if (stability_array[i] == 2)
                stable_pieces_player += 3; // Fully stable
            else if (stability_array[i] == 1)
                stable_pieces_player += 1; // Semi-stable
        }
        else if (board_state[i] == opponent_colour)
        {
            if (stability_array[i] == 2)
                stable_pieces_opponent += 3; // Fully stable
            else if (stability_array[i] == 1)
                stable_pieces_opponent += 1; // Semi-stable
        }
    }

    // Calculate stability score
    if (stable_pieces_player + stable_pieces_opponent > 0)
    {
        stability_score = 10 * (stable_pieces_player - stable_pieces_opponent) /
                          (stable_pieces_player + stable_pieces_opponent + 1);
    }

#ifdef DEBUG
    fprintf(fp, "Ended evauluating stability \n");
#endif

    return stability_score;
}

/**
 * Heuristic 4: Evaluate parity - whether the player will have the last move.
 *
 * @param num_empty_positions The number of empty squares remaining on the board.
 * @return An integer score representing the parity advantage for the player.
 */
int evaluate_parity(int num_empty_positions)
{
#ifdef DEBUG
    fprintf(fp, "Evaluating parity \n");
#endif

    int score = 0;
    // Even number of empty squares, opponent has last move
    if (num_empty_positions % 2 == 0)
    {
        score = -15;
    }
    else
    {
        score = 15;
    }
    return score;
}
