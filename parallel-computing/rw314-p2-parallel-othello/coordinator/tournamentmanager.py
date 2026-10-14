from coordinator import server
from coordinator import lobby
from coordinator import doublereleaselock
from coordinator import doublereleasesemaphore
import uuid
from common import globals
import asyncio
import csv
from collections import defaultdict


async def play():
    # Start server
    server_task = asyncio.create_task(server.get_server_process())
    
    await asyncio.sleep(2)
    
    sem = doublereleasesemaphore.DoubleReleaseSemaphore(globals.CONCURRENT_LOBBIES)
    double_lock = doublereleaselock.DoubleReleaseLock()
    lobby_tasks = []
    
    for player1, player2 in globals.round_robin_pairs:
        lobby_id = str(uuid.uuid4())
        # Need to await lobby start before players can connect.
        await lobby.start_lobby(lobby_id, player1, player2, sem, double_lock)
        task = asyncio.create_task(lobby.connect_players(lobby_id, sem, double_lock))
        lobby_tasks.append(task)
    
    if lobby_tasks:
        await asyncio.gather(*lobby_tasks)
        
    # await server_task

    if not globals.GAME_CRASH:
        update_winners_and_get_stats(globals.RESULTS_CSV_PATH)
    else:
        err_msg = "\n\n" + "=" * 60 + "\n"
        err_msg += " " * 16 + "Crash Detected\n\n"
        err_msg += "Details: Client crashed the game with an error message below. "
        err_msg += "Refer to the latest .log files in `IngeniousFrame/Logs` for more info.\n\n"
        err_msg += f"{globals.GAME_CRASH_MESSAGE}\n"
        err_msg += "=" * 60 + "\n"
        globals.logger.error(err_msg)

def update_winners_and_get_stats(csv_file):
    with open(csv_file, 'r') as file:
        reader = csv.DictReader(file)
        rows = list(reader)

    stats = {
        'win_counts': defaultdict(int),
        'tie_counts': defaultdict(int),
        'loss_counts': defaultdict(int),
        'points': defaultdict(float)
    }
    players = set()
    matchups = []
    
    for i, row in enumerate(rows, 1):
        player1, player2 = row['Player 1'], row['Player 2']
        players.add(player1)
        players.add(player2)
        
        player1_wins = 0
        player2_wins = 0
        games_detail = []
        
        for game in ['Game 1', 'Game 2']:
            p1_chips = float(row[f'Player 1 Chips {game}']) if row[f'Player 1 Chips {game}'] else 0
            p2_chips = float(row[f'Player 2 Chips {game}']) if row[f'Player 2 Chips {game}'] else 0
            
            if p1_chips == 0 and p2_chips == 0:
                continue
                
            if p1_chips > p2_chips:
                player1_wins += 1
                winner, loser = player1, player2
            elif p2_chips > p1_chips:
                player2_wins += 1
                winner, loser = player2, player1
            else:
                winner = loser = "Tie"
                
            games_detail.append({
                'game': game,
                'winner': winner,
                'loser': loser,
                'player1_chips': p1_chips,
                'player2_chips': p2_chips
            })
        
        if player1_wins > player2_wins:
            update_match_stats(stats, player1, player2, 'win')
            match_winner = player1
        elif player2_wins > player1_wins:
            update_match_stats(stats, player2, player1, 'win')
            match_winner = player2
        elif games_detail:  # Tie (only if games were played)
            update_match_stats(stats, player1, player2, 'tie')
            match_winner = "Tie"
        else:
            match_winner = "No games played"
            
        row['Winner'] = match_winner
        matchups.append({
            'round': i,
            'player1': player1,
            'player2': player2,
            'games': games_detail,
            'winner': match_winner
        })
    
    with open(csv_file, 'w', newline='') as file:
        fieldnames = ['Lobby ID', 'Player 1', 'Player 2', 'Player 1 Chips Game 1', 'Player 2 Chips Game 1',
                     'Player 1 Chips Game 2', 'Player 2 Chips Game 2', 'Winner']
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    
    print_tournament_results(players, matchups, stats)

def update_match_stats(stats, winner, loser, result):
    if result == 'win':
        stats['win_counts'][winner] += 1
        stats['loss_counts'][loser] += 1
        stats['points'][winner] += 1
    elif result == 'tie':
        stats['tie_counts'][winner] += 1
        stats['tie_counts'][loser] += 1
        stats['points'][winner] += 0.5
        stats['points'][loser] += 0.5

def print_tournament_results(players, matchups, stats):
    print("\n" + "=" * 50)
    print("\t\tRESULTS")
    print("=" * 50 + "\n")
    
    print("Players:")
    for player in sorted(players):
        print(f"\t- {player}")
    
    print("\nSummaries:")
    for matchup in matchups:
        p1, p2 = matchup['player1'], matchup['player2']
        games = matchup['games']
        
        print(f"\n\t> Round {matchup['round']}, {p1} vs {p2}")
        
        for game in games:
            game_name = game['game']
            if game['winner'] != "Tie":
                winner_chips = game['player1_chips'] if game['winner'] == p1 else game['player2_chips']
                loser_chips = game['player2_chips'] if game['winner'] == p1 else game['player1_chips']
                print(f"\t\t{game_name}: {game['winner']} ({winner_chips}) defeated {game['loser']} ({loser_chips})")
            else:
                print(f"\t\t{game_name}: Tie ({game['player1_chips']} - {game['player2_chips']})")
        
        print(f"\n\t\tResult: {matchup['winner']}")
    
    print("\nPlayer Rankings:")
    sorted_players = sorted(players, key=lambda p: -stats['points'][p])
    
    rank = 1
    prev_points = None
    for i, player in enumerate(sorted_players):
        points = stats['points'][player]

        if points == prev_points:
            display_rank = rank
        else:
            display_rank = i + 1
            rank = i + 1
        
        prev_points = points
        
        wins = stats['win_counts'][player]
        ties = stats['tie_counts'][player]
        losses = stats['loss_counts'][player]
        
        win_text = "Win" if wins == 1 else "Wins"
        tie_text = "Tie" if ties == 1 else "Ties"
        loss_text = "Loss" if losses == 1 else "Losses"
        
        print(f"\t{display_rank}. {player} ({wins} {win_text}, {ties} {tie_text}, {losses} {loss_text}) - {points} points")
