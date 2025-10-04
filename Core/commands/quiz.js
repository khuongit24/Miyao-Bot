/**
 * Music Quiz Command
 * Interactive music guessing game
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} from 'discord.js';
import History from '../database/models/History.js';
import logger from '../utils/logger.js';

// Active quiz sessions
const activeQuizzes = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('quiz')
        .setDescription('Start a music quiz game')
        .addStringOption(option =>
            option
                .setName('mode')
                .setDescription('Quiz mode')
                .addChoices(
                    { name: 'Guess the Song', value: 'song' },
                    { name: 'Guess the Artist', value: 'artist' }
                )
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName('questions')
                .setDescription('Number of questions (1-10)')
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(false)
        ),

    async execute(interaction, client) {
        try {
            await interaction.deferReply();

            const mode = interaction.options.getString('mode') || 'song';
            const questionCount = interaction.options.getInteger('questions') || 5;
            const guildId = interaction.guildId;

            // Check if quiz already active in this channel
            if (activeQuizzes.has(interaction.channelId)) {
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Quiz Already Active')
                    .setDescription('A quiz is already running in this channel. Please wait for it to finish!')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Get history to create questions
            const history = History.getGuildHistory(guildId, 100);

            if (!history || history.length < 10) {
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('❌ Insufficient Data')
                    .setDescription('Need at least 10 tracks in server history to start a quiz. Play more music first!')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Create quiz session
            const quizSession = {
                mode,
                questionCount,
                currentQuestion: 0,
                score: 0,
                participants: new Map(), // userId -> score
                startTime: Date.now(),
                host: interaction.user.id
            };

            activeQuizzes.set(interaction.channelId, quizSession);

            // Show start screen
            const startEmbed = new EmbedBuilder()
                .setColor('#00D9FF')
                .setTitle('🎮 Music Quiz Starting!')
                .setDescription([
                    `**Mode:** ${mode === 'song' ? 'Guess the Song' : 'Guess the Artist'}`,
                    `**Questions:** ${questionCount}`,
                    `**Time per question:** 30 seconds`,
                    `\nGet ready! First question coming up...`
                ].join('\n'))
                .setFooter({ text: `Hosted by ${interaction.user.username}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [startEmbed] });

            // Wait 3 seconds before first question
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Start quiz
            await askQuestion(interaction, client, history, quizSession);

        } catch (error) {
            logger.error('Error in quiz command', { error });

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('Failed to start quiz. Please try again.')
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Cleanup
            activeQuizzes.delete(interaction.channelId);
        }
    }
};

/**
 * Ask a quiz question
 */
async function askQuestion(interaction, client, history, session) {
    try {
        session.currentQuestion++;

        // Check if quiz is complete
        if (session.currentQuestion > session.questionCount) {
            return await showResults(interaction, session);
        }

        // Select random track for question
        const correctTrack = history[Math.floor(Math.random() * history.length)];

        // Generate wrong answers
        const wrongTracks = history
            .filter(t => t.id !== correctTrack.id)
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);

        // Shuffle options
        const options = [correctTrack, ...wrongTracks].sort(() => Math.random() - 0.5);

        // Create question embed
        const questionEmbed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`🎵 Question ${session.currentQuestion}/${session.questionCount}`)
            .setFooter({ text: '30 seconds to answer!' })
            .setTimestamp();

        if (session.mode === 'song') {
            questionEmbed.setDescription(
                `**Artist:** ${correctTrack.track_author}\n\nWhat's the song name?`
            );
        } else {
            questionEmbed.setDescription(
                `**Song:** ${correctTrack.track_title}\n\nWho's the artist?`
            );
        }

        // Create answer buttons
        const row = new ActionRowBuilder();
        options.forEach((track, index) => {
            const label = session.mode === 'song' 
                ? (track.track_title.length > 50 ? track.track_title.substring(0, 47) + '...' : track.track_title)
                : (track.track_author.length > 50 ? track.track_author.substring(0, 47) + '...' : track.track_author);

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`quiz_answer_${index}_${track.id === correctTrack.id}`)
                    .setLabel(label)
                    .setStyle(ButtonStyle.Primary)
            );
        });

        const message = await interaction.followUp({
            embeds: [questionEmbed],
            components: [row]
        });

        // Store correct answer
        session.correctAnswer = correctTrack;
        session.answeredUsers = new Set();

        // Create collector for answers
        const collector = message.createMessageComponentCollector({
            time: 30000 // 30 seconds
        });

        collector.on('collect', async (i) => {
            // Check if user already answered
            if (session.answeredUsers.has(i.user.id)) {
                return await i.reply({
                    content: '⚠️ You already answered this question!',
                    ephemeral: true
                });
            }

            session.answeredUsers.add(i.user.id);

            // Check answer
            const [, , , isCorrect] = i.customId.split('_');
            const correct = isCorrect === 'true';

            if (correct) {
                // Award points
                const currentScore = session.participants.get(i.user.id) || 0;
                session.participants.set(i.user.id, currentScore + 10);

                await i.reply({
                    content: '✅ **Correct!** +10 points',
                    ephemeral: true
                });
            } else {
                await i.reply({
                    content: `❌ **Wrong!** Correct answer: **${
                        session.mode === 'song' 
                            ? correctTrack.track_title 
                            : correctTrack.track_author
                    }**`,
                    ephemeral: true
                });
            }
        });

        collector.on('end', async () => {
            // Disable buttons
            const disabledRow = new ActionRowBuilder()
                .addComponents(
                    row.components.map(button => 
                        ButtonBuilder.from(button).setDisabled(true)
                    )
                );

            await message.edit({ components: [disabledRow] }).catch(() => {});

            // Show correct answer
            const answerEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Time\'s Up!')
                .setDescription([
                    `**Correct Answer:**`,
                    session.mode === 'song' 
                        ? `🎵 **${correctTrack.track_title}** by ${correctTrack.track_author}`
                        : `👤 **${correctTrack.track_author}** - ${correctTrack.track_title}`,
                    `\n${session.answeredUsers.size} player(s) answered`
                ].join('\n'))
                .setTimestamp();

            await interaction.followUp({ embeds: [answerEmbed] });

            // Wait 2 seconds before next question
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Next question
            await askQuestion(interaction, client, history, session);
        });

    } catch (error) {
        logger.error('Error in quiz question', { error });
        activeQuizzes.delete(interaction.channelId);
    }
}

/**
 * Show quiz results
 */
async function showResults(interaction, session) {
    try {
        // Sort participants by score
        const rankings = Array.from(session.participants.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const duration = Math.round((Date.now() - session.startTime) / 1000);

        const resultsEmbed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🏆 Quiz Complete!')
            .setDescription(`**Mode:** ${session.mode === 'song' ? 'Guess the Song' : 'Guess the Artist'}\n**Duration:** ${duration}s`)
            .setTimestamp();

        if (rankings.length === 0) {
            resultsEmbed.addFields({
                name: '😢 No Participants',
                value: 'Nobody answered any questions!'
            });
        } else {
            const leaderboardText = await Promise.all(
                rankings.map(async ([userId, score], index) => {
                    const rank = index + 1;
                    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
                    const rankDisplay = medals[rank] || `**#${rank}**`;

                    try {
                        const user = await interaction.client.users.fetch(userId);
                        return `${rankDisplay} **${user.username}** - ${score} points`;
                    } catch (error) {
                        return `${rankDisplay} Unknown User - ${score} points`;
                    }
                })
            );

            resultsEmbed.addFields({
                name: '🏅 Leaderboard',
                value: leaderboardText.join('\n')
            });

            // Winner message
            const [winnerId] = rankings[0];
            try {
                const winner = await interaction.client.users.fetch(winnerId);
                resultsEmbed.setFooter({ 
                    text: `👑 Winner: ${winner.username}`,
                    iconURL: winner.displayAvatarURL()
                });
            } catch (error) {
                // Ignore
            }
        }

        await interaction.followUp({ embeds: [resultsEmbed] });

        // Cleanup
        activeQuizzes.delete(interaction.channelId);

        logger.command('quiz', {
            mode: session.mode,
            questions: session.questionCount,
            participants: rankings.length,
            duration
        });

    } catch (error) {
        logger.error('Error showing quiz results', { error });
        activeQuizzes.delete(interaction.channelId);
    }
}
