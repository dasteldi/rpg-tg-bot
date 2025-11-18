const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

const uri = process.env.MONGODB_URI || 'mongodb://new1:27017/bot_db';
const client = new MongoClient(uri);

let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db('bot_db');
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
}

async function getUser(userId) {
  const usersCollection = db.collection('users');
  return await usersCollection.findOne({ tg_id: userId });
}


async function updateUser(userId, update) {
  const usersCollection = db.collection('users');
  return await usersCollection.updateOne({ tg_id: userId }, update);
}


async function checkLevelUp(ctx, userId) {
  try {
    const user = await getUser(userId);
    if (!user) return;

    if (user.exp >= user.exp_to_next_level) {
      const newLevel = user.lvl + 1;
      const newExpToNextLevel = newLevel * 100;
      
      await updateUser(userId, {
        $inc: { lvl: 1 },
        $set: { 
          exp: user.exp - user.exp_to_next_level,
          exp_to_next_level: newExpToNextLevel
        }
      });

      let status = "Новичок";
      if (newLevel >= 5) status = "Опытный";
      if (newLevel >= 10) status = "Профессионал";
      if (newLevel >= 20) status = "Эксперт";
      if (newLevel >= 30) status = "Мастер";

      await updateUser(userId, { $set: { status } });

      await ctx.reply(`🎉 Поздравляем! Вы достигли ${newLevel} уровня!\n⭐ Новый статус: ${status}`);
    }
  } catch (error) {
    console.error('Error checking level up:', error);
  }
}

bot.command('start', async (ctx) => {
  const userId = ctx.from.id;

  try {
    const usersCollection = db.collection('users');
    
    const existingUser = await usersCollection.findOne({ tg_id: userId });
    
    if (!existingUser) {

      const newUser = {
        tg_id: userId,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        money: 100, 
        lvl: 1,
        exp: 0,
        exp_to_next_level: 100,
        standard_cases: 2, 
        silver_cases: 0,
        gold_cases: 0,
        status: "Новичок",
        last_work: null,
        energy: 30,
        registered_at: new Date()
      };

      await usersCollection.insertOne(newUser);
    } else {
      console.log(`Пользователь уже существует: ${userId}`);
    }

    const user = await usersCollection.findOne({ tg_id: userId });
    
    if (!user) {
      return ctx.reply('❌ Пользователь не найден в базе.');
    }

    const profile = `
👤 Ваш профиль:
💰 Баланс: ${user.money} монет
🎯 Уровень: ${user.lvl} (${user.exp || 0}/${user.exp_to_next_level || 100} опыта)
⭐ Статус: ${user.status}
⚡ Энергия: ${user.energy || 0}/30
📅 Регистрация: ${user.registered_at.toLocaleDateString()}
${user.username ? `👤 Username: @${user.username}` : ''}
    `.trim();

    const keyboard = Markup.inlineKeyboard([
      [ Markup.button.callback('💼 Работы', 'btn_works') ],
      [ Markup.button.callback('🛍️ Магазин', 'btn_shop') ],
      [ Markup.button.callback('📦 Кейсы', 'btn_case') ],
      [ Markup.button.callback('📊 Профиль', 'btn_profile') ]
    ]);

    await ctx.reply(`👋 Привет, ${ctx.from.first_name}! Добро пожаловать в бота.\n\n${profile}`, keyboard);

  } catch (error) {
    console.error('Error in start command:', error);
    await ctx.reply('❌ Произошла ошибка при регистрации.');
  }
});

bot.action('btn_works', async (ctx) => {
  await ctx.answerCbQuery();
  
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    
    if (!user) return ctx.reply('❌ Пользователь не найден.');

    const keyboard = Markup.inlineKeyboard([
      [ Markup.button.callback(`⛏️ Шахта - 150 монет (Энергия: ${user.energy || 0}/30)`, 'btn_mine') ],
      [ Markup.button.callback('🛒 Разносчик - 250 монет', 'btn_delivery') ],
      [ Markup.button.callback('💼 Офис - 400 монет', 'btn_office') ],
      [ Markup.button.callback('🔙 Назад', 'back_to_main') ]
    ]);
    
    await ctx.reply('🔥 Выбери подходящую работу!\n\nЗарабатывай деньги и получай опыт!', keyboard);
    
  } catch (error) {
    console.error('Error in works menu:', error);
    await ctx.reply('❌ Ошибка при загрузке работ.');
  }
});

bot.action('btn_mine', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  
  try {
    const user = await getUser(userId);
    if (!user) return ctx.reply('❌ Пользователь не найден.');

    if (user.energy > 0) {
      const earnings = 150;
      const expGained = 3;
      
      await updateUser(userId, { 
        $inc: { 
          energy: -1,
          money: earnings,
          exp: expGained
        },
        $set: { last_work: new Date() }
      });

      await ctx.reply(`⛏️ Вы поработали в шахте, потратили единицу энергии и заработали:\n💰 ${earnings} монет\n⭐ ${expGained} опыта`);
      
      await checkLevelUp(ctx, userId);
    } else {
      await ctx.reply('❌ У вас закончилась энергия! Отдохните или купите бусты в магазине.');
    }
    
  } catch (error) {
    console.error('Error in mine work:', error);
    await ctx.reply('❌ Ошибка при работе.');
  }
});

bot.action('btn_delivery', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  
  try {
    const user = await getUser(userId);
    if (!user) return ctx.reply('❌ Пользователь не найден.');

    if (user.lvl < 2) {
      return ctx.reply('❌ Для этой работы нужен 2 уровень!');
    }

    if (user.energy < 2) {
      return ctx.reply('❌ Для этой работы нужно 2 единицы энергии!');
    }

    const earnings = 250;
    const expGained = 10;

    await updateUser(userId, {
      $inc: { 
        money: earnings,
        exp: expGained,
        energy: -2
      },
      $set: { last_work: new Date() }
    });

    await ctx.reply(`🛒 Вы поработали разносчиком, потратили 2 единицы энергии и заработали:\n💰 ${earnings} монет\n⭐ ${expGained} опыта`);
    
    await checkLevelUp(ctx, userId);
    
  } catch (error) {
    console.error('Error in delivery work:', error);
    await ctx.reply('❌ Ошибка при работе.');
  }
});

bot.action('btn_office', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  
  try {
    const user = await getUser(userId);
    if (!user) return ctx.reply('❌ Пользователь не найден.');

    if (user.lvl < 3) {
      return ctx.reply('❌ Для этой работы нужен 3 уровень!');
    }

    if (user.energy < 3) {
      return ctx.reply('❌ Для этой работы нужно 3 единицы энергии!');
    }

    const earnings = 400;
    const expGained = 20;

    await updateUser(userId, {
      $inc: { 
        money: earnings,
        exp: expGained,
        energy: -3
      },
      $set: { last_work: new Date() }
    });

    await ctx.reply(`💼 Вы поработали в офисе, потратили 3 единицы энергии и заработали:\n💰 ${earnings} монет\n⭐ ${expGained} опыта`);
    
    await checkLevelUp(ctx, userId);
    
  } catch (error) {
    console.error('Error in office work:', error);
    await ctx.reply('❌ Ошибка при работе.');
  }
});

bot.action('btn_shop', async (ctx) => {
  await ctx.answerCbQuery();
  
  const shopKeyboard = Markup.inlineKeyboard([
    [ 
      Markup.button.callback('📦 Кейсы', 'buy_cases'),
      Markup.button.callback('⚡ Бусты', 'buy_boosts')
    ],
    [ 
      Markup.button.callback('🔙 Назад', 'back_to_main')
    ]
  ]);
  
  await ctx.reply('🛍️ Добро пожаловать в магазин!\n\nВыберите категорию:', shopKeyboard);
});

bot.action('buy_boosts', async (ctx) => {
  await ctx.answerCbQuery();
  
  const boostsKeyboard = Markup.inlineKeyboard([
    [ 
      Markup.button.callback('⚡ +10 энергии - 3000 монет', 'buy_energy_10'),
      Markup.button.callback('⚡ +30 энергии - 9000 монет', 'buy_energy_30')
    ],
    [ 
      Markup.button.callback('🔙 Назад в магазин', 'btn_shop')
    ]
  ]);
  
  await ctx.reply('⚡ Магазин бустов:\n\nВосстановите свою энергию!', boostsKeyboard);
});

bot.action('buy_energy_10', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  
  try {
    const user = await getUser(userId);
    if (!user) return ctx.reply('❌ Пользователь не найден.');

    if (user.money < 3000) {
      return ctx.reply('❌ Недостаточно монет для покупки!');
    }

    await updateUser(userId, {
      $inc: { 
        money: -3000,
        energy: 10
      }
    });

    await ctx.reply('✅ Вы купили +10 энергии за 3000 монет!');
    
  } catch (error) {
    console.error('Error buying energy:', error);
    await ctx.reply('❌ Ошибка при покупке.');
  }
});

bot.action('buy_energy_30', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  
  try {
    const user = await getUser(userId);
    if (!user) return ctx.reply('❌ Пользователь не найден.');

    if (user.money < 9000) {
      return ctx.reply('❌ Недостаточно монет для покупки!');
    }

    await updateUser(userId, {
      $inc: { 
        money: -9000,
        energy: 30
      }
    });

    await ctx.reply('✅ Вы купили +30 энергии за 9000 монет!');
    
  } catch (error) {
    console.error('Error buying energy:', error);
    await ctx.reply('❌ Ошибка при покупке.');
  }
});

bot.action('btn_case', async (ctx) => {
  await ctx.answerCbQuery();
  
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    
    if (!user) {
      return ctx.reply('❌ Пользователь не найден.');
    }

    const casesMessage = `
📦 Ваши кейсы:

🟤 Стандартные кейсы: ${user.standard_cases || 0}
🟠 Серебряные кейсы: ${user.silver_cases || 0}
🟡 Золотые кейсы: ${user.gold_cases || 0}

Выберите кейс для открытия:
    `.trim();

    const casesKeyboard = Markup.inlineKeyboard([
      [ 
        Markup.button.callback('🟤 Стандартный', 'open_standard_case'),
        Markup.button.callback('🟠 Серебряный', 'open_silver_case')
      ],
      [ 
        Markup.button.callback('🟡 Золотой', 'open_gold_case'),
        Markup.button.callback('💰 Купить кейсы', 'buy_cases')
      ],
      [ 
        Markup.button.callback('🔙 Назад', 'back_to_main')
      ]
    ]);

    await ctx.reply(casesMessage, casesKeyboard);

  } catch (error) {
    console.error('Error in cases:', error);
    await ctx.reply('❌ Ошибка при загрузке кейсов.');
  }
});

bot.action('open_standard_case', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  
  try {
    const user = await getUser(userId);
    
    if (!user) {
      return ctx.reply('❌ Пользователь не найден.');
    }
    
    if ((user.standard_cases || 0) < 1) {
      return ctx.reply('❌ У вас нет стандартных кейсов!');
    }

    await updateUser(userId, { $inc: { standard_cases: -1 } });

    const rewards = [
      { type: 'money', value: 100 },
      { type: 'money', value: 150 },
      { type: 'money', value: 200 },
      { type: 'money', value: 300 },
      { type: 'exp', value: 50 },
      { type: 'case', value: 'standard' },
      { type: 'energy', value: 5 }
    ];
    const reward = rewards[Math.floor(Math.random() * rewards.length)];
    
    let message = `🎉 Вы открыли стандартный кейс и получили: `;
    
    if (reward.type === 'money') {
      await updateUser(userId, { $inc: { money: reward.value } });
      message += `💰 ${reward.value} монет!`;
    } else if (reward.type === 'exp') {
      await updateUser(userId, { $inc: { exp: reward.value } });
      message += `⭐ ${reward.value} опыта!`;
      await checkLevelUp(ctx, userId);
    } else if (reward.type === 'case') {
      await updateUser(userId, { $inc: { standard_cases: 1 } });
      message += `📦 +1 стандартный кейс!`;
    } else if (reward.type === 'energy') {
      await updateUser(userId, { $inc: { energy: reward.value } });
      message += `⚡ +${reward.value} энергии!`;
    }
    
    await ctx.reply(message);
    
  } catch (error) {
    console.error('Error opening case:', error);
    await ctx.reply('❌ Ошибка при открытии кейса.');
  }
});

bot.action('open_silver_case', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  
  try {
    const user = await getUser(userId);
    
    if (!user) {
      return ctx.reply('❌ Пользователь не найден.');
    }
    
    if (user.lvl < 3) {
      return ctx.reply('❌ Для открытия серебряных кейсов нужен 3 уровень!');
    }
    
    if ((user.silver_cases || 0) < 1) {
      return ctx.reply('❌ У вас нет серебряных кейсов!');
    }
    
    await ctx.reply('🟠 Серебряные кейсы скоро будут доступны!');
    
  } catch (error) {
    console.error('Error opening silver case:', error);
    await ctx.reply('❌ Ошибка при открытии кейса.');
  }
});

bot.action('open_gold_case', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  
  try {
    const user = await getUser(userId);
    
    if (!user) {
      return ctx.reply('❌ Пользователь не найден.');
    }
    
    if (user.lvl < 5) {
      return ctx.reply('❌ Для открытия золотых кейсов нужен 5 уровень!');
    }
    
    if ((user.gold_cases || 0) < 1) {
      return ctx.reply('❌ У вас нет золотых кейсов!');
    }
    
    await ctx.reply('🟡 Золотые кейсы скоро будут доступны!');
    
  } catch (error) {
    console.error('Error opening gold case:', error);
    await ctx.reply('❌ Ошибка при открытии кейса.');
  }
});

bot.action('buy_cases', async (ctx) => {
  await ctx.answerCbQuery();
  
  const buyKeyboard = Markup.inlineKeyboard([
    [ 
      Markup.button.callback('🟤 Стандартный - 50 монет', 'buy_standard_case'),
      Markup.button.callback('🟠 Серебряный - 150 монет', 'buy_silver_case')
    ],
    [ 
      Markup.button.callback('🟡 Золотой - 500 монет', 'buy_gold_case'),
      Markup.button.callback('🔙 Назад к кейсам', 'btn_case')
    ]
  ]);
  
  await ctx.reply('🛍️ Магазин кейсов:\n\nВыберите кейс для покупки:', buyKeyboard);
});

// Обработчики покупки кейсов
bot.action('buy_standard_case', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  
  try {
    const user = await getUser(userId);
    
    if (!user) {
      return ctx.reply('❌ Пользователь не найден.');
    }
    
    if (user.money < 50) {
      return ctx.reply('❌ Недостаточно монет для покупки стандартного кейса!');
    }
    
    // Списание денег и добавление кейса
    await updateUser(userId, { 
      $inc: { 
        money: -50,
        standard_cases: 1
      } 
    });
    
    await ctx.reply('✅ Вы купили стандартный кейс за 50 монет!');
    
  } catch (error) {
    console.error('Error buying case:', error);
    await ctx.reply('❌ Ошибка при покупке кейса.');
  }
});

bot.action('btn_profile', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  
  try {
    const user = await getUser(userId);
    
    if (!user) {
      return ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
    }

    const profile = `
👤 Ваш профиль:
🆔 ID: ${user.tg_id}
👤 Имя: ${user.first_name}
${user.username ? `📱 Username: @${user.username}` : ''}
💰 Баланс: ${user.money} монет
🎯 Уровень: ${user.lvl} (${user.exp || 0}/${user.exp_to_next_level || 100} опыта)
⭐ Статус: ${user.status}
⚡ Энергия: ${user.energy || 0}/30
📦 Кейсы:
  🟤 Стандартные: ${user.standard_cases || 0}
  🟠 Серебряные: ${user.silver_cases || 0}
  🟡 Золотые: ${user.gold_cases || 0}
📅 Регистрация: ${user.registered_at.toLocaleDateString()}
    `.trim();

    await ctx.reply(profile);

  } catch (error) {
    console.error('Error in profile:', error);
    await ctx.reply('❌ Ошибка при получении профиля');
  }
});

bot.action('back_to_main', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
});

async function startBot() {
  await connectDB();
  bot.launch();
  console.log('Бот запущен!');
}

process.once('SIGINT', () => {
  console.log('Остановка бота...');
  bot.stop('SIGINT');
  client.close();
});

process.once('SIGTERM', () => {
  console.log('Остановка бота...');
  bot.stop('SIGTERM');
  client.close();
});

startBot();