# Parallel Othello Engine

An Othello player written in C that thinks in parallel. One process talks to the referee, and a team of worker processes search the game tree at the same time using MPI. It plays inside the Ingenious Framework, the tournament setup we used in RW314 (Parallel Computing) at Stellenbosch.

## How it works

**Parallel part.** The engine runs as a master and several workers, all started with MPI.

1. The master (rank 0) talks to the referee. When it's our turn it works out every legal move.
2. It splits those moves between the workers as evenly as it can and sends each worker the board.
3. Each worker searches its share of the moves and sends back its best move and score.
4. The master collects the answers with non-blocking receives and a timeout, so a slow worker can't make us miss the move clock. It plays the best result it has.

The master also forwards the opponent's moves to every worker so all of them keep the same board.

**Search part.** Each worker runs minimax with alpha-beta pruning, 4 moves deep.

**Judging a position.** At the end of the search, a board is scored by adding up:

- **Position:** corners and edges are worth the most, and the squares next to a corner only become safe once you own that corner
- **Mobility:** how many legal moves each side has
- **Stability:** how safe pieces are from being flipped, split into stable, semi-stable and unstable
- **Parity:** who gets the last move in the endgame
- **Piece difference:** a small bonus normally, and the main thing once only two squares are left

## What I'd improve

The depth is fixed at 4. I split the moves between workers up front and never rebalance, so a worker that gets the awkward moves finishes last. When I tried searching deeper, workers ran out of time. The fix would be dynamic work sharing, where idle workers pick up leftover moves from a shared queue. It's the first thing I'd add.

The heuristic weights are also hand-picked, using the papers and guides listed below. With more time I'd tune them by playing the engine against itself.

## Run it

You need Java (the framework is a jar), `mpicc` for compiling the C clients, and Python 3.

```bash
python3 play.py Othello           # compile the players and run a tournament
python3 play.py Othello DEBUG     # same, with more logging
python3 play.py CLEAN_ALL         # delete logs and compiled players
```

`play.py` also accepts `CLEAN_LOGS` and `CLEAN_PLAYERS` on their own. The framework jars aren't in this repo, so you need to drop in the ones from the course. To run everything in Docker instead (install Rancher Desktop first):

```bash
./buildDocker.sh
```

Logs land in `IngeniousFrame/Logs`, plus `my_player.log` for the master and `worker_X.log` for each worker. They show the board states, which moves went to which worker, and the messages passed between processes.

## Project structure

```
.
├── my_player/src/
│   ├── my_player.c        the engine: master, workers, minimax, heuristics
│   ├── comms.c / comms.h  referee communication
├── random_player/src/     baseline player that picks random legal moves
├── play.py                tournament entry point
├── coordinator/           runs the framework server and matches
├── setup/                 compiles and loads the players
├── common/                shared settings
├── Dockerfile
└── buildDocker.sh
```

## Where the ideas came from

- [GeeksforGeeks: minimax](https://www.geeksforgeeks.org/mini-max-algorithm-in-artificial-intelligence/) for implementing minimax
- [arXiv 2310.19387](https://arxiv.org/pdf/2310.19387) for which heuristics matter, how alpha-beta works, and the stable / semi-stable / unstable idea
- [Othello slides](https://play-othello.appspot.com/files/Othello.pdf) for the position weights
- [A mini-project paper from UW](https://courses.cs.washington.edu/courses/cse573/04au/Project/mini1/RUSSIA/miniproject1_vaishu_muthu/Paper/Final_Paper.pdf) for mobility, parity and minimax heuristics
- [Kartik Kukreja's Othello heuristic post](https://kartikkukreja.wordpress.com/2013/03/30/heuristic-function-for-reversiothello/) for the stability formula
- [Pressibus: minimax notes](https://pressibus.org/ataxx/autre/minimax/node3.html) for which pieces count as stable

## AI use

I used ChatGPT for more detailed code comments and to tidy redundant code, and BlackBox to help explain the game, suggest scoring numbers, and write some of the log messages.
