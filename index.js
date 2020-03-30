const Koa = require('koa');
const bodyParser = require('koa-body');
const datalize = require('datalize');

const app = new Koa();
const router = new (require('koa-router'))();

const field = datalize.field;
const DOMAIN_ERROR = "Email's domain does not have a valid MX (mail) entry in its DNS record";

const userValidator = datalize([
	field('name').patch().trim().required(),
	field('email').patch().required().email(),
	field('type').patch().required().select(['admin', 'user']),
]);

// set datalize to throw an error if validation fails
datalize.set('autoValidate', true);

// only Koa
// add to very beginning of Koa middleware chain
app.use(async (ctx, next) => {
	try {
		await next();
	} catch (err) {
		if (err instanceof datalize.Error) {
			ctx.status = 400;
			ctx.body = err.toJSON();
		} else {
			ctx.status = 500;
			ctx.body = 'Internal server error';
		}
	}
});

// helper for returning errors in routes
app.context.error = function(code, obj) {
  this.status = code;
  this.body = obj;
};

// add koa-body middleware to parse JSON and form-data body
app.use(
  bodyParser({
    enableTypes: ['json', 'form'],
    multipart: true,
    formidable: {
      maxFileSize: 32 * 1024 * 1024
    }
  })
);

// Routes...
/**
 * @api {post} / Create a user
 * ...
 */
router.post('/', datalize([
	field('name').trim().required(),
	field('email').required().email(),
]), async (ctx) => {
	if (!ctx.form.isValid) {
		return ctx.error(400, {errors: ctx.form.errors});
	}
	
	const user = await User.create(ctx.form);
	
	ctx.body = user.toJSON();
});

/**
 * @api {get} / List users
 * ...
 */
router.post('/', datalize.query([
	field('keywords').trim(),
	field('page').default(1).number(),
	field('perPage').required().select([10, 30, 50]),
]), async (ctx) => {
	const limit = ctx.data.perPage;
	const where = {
	};
	
	if (ctx.data.keywords) {
		where.name = {[Op.like]: ctx.data.keywords + '%'};
	}
	
	const users = await User.findAll({
		where,
		limit,
		offset: (ctx.data.page - 1) * limit,
	});
	
	ctx.body = users;
});

/**
 * @api {post} / Create a user
 * ...
 */
router.post('/', datalize([
	field('name').trim().required(),
	field('email').required().email().custom((value) => {
		return new Promise((resolve, reject) => {
			dns.resolve(value.split('@')[1], 'MX', function(err, addresses) {
				if (err || !addresses || !addresses.length) {
					return reject(new Error(DOMAIN_ERROR));
				}
				
				resolve();
			});
		});
	}),
	field('type').required().select(['admin', 'user']),
	field('languages').array().container([
		field('id').required().id(),
		field('level').required().select(['beginner', 'intermediate', 'advanced'])
	]),
	field('groups').array().id(),
]), async (ctx) => {
	const {languages, groups} = ctx.form;
	delete ctx.form.languages;
	delete ctx.form.groups;
	
	const user = await User.create(ctx.form);
	
	await UserGroup.bulkCreate(groups.map(groupId => ({
		groupId,
		userId: user.id,
	})));
	
	await UserLanguage.bulkCreate(languages.map(item => ({
		languageId: item.id,
		userId: user.id,
        level: item.level,
    })));
});

const userEditMiddleware = async (ctx, next) => {
	const user = await User.findByPk(ctx.params.id);
	
	// cancel request here if user was not found
	if (!user) {
		throw new Error('User was not found.');
	}
	
	// store user instance in the request so we can use it later
	ctx.user = user;
	
	return next();
};

/**
 * @api {post} / Create a user
 * ...
 */
router.post('/', userValidator, async (ctx) => {
	const user = await User.create(ctx.form);
	
	ctx.body = user.toJSON();
});

/**
 * @api {put} / Update a user
 * ...
 */
router.put('/:id', userEditMiddleware, userValidator, async (ctx) => {
	await ctx.user.update(ctx.form);
	
	ctx.body = ctx.user.toJSON();
});

/**
 * @api {patch} / Patch a user
 * ...
 */
router.patch('/:id', userEditMiddleware, userValidator, async (ctx) => {
	if (!Object.keys(ctx.form).length) {
		return ctx.error(400, {message: 'Nothing to update.'});
	}
	
	await ctx.user.update(ctx.form);
	
	ctx.body = ctx.user.toJSON();
});

field.prototype.date = function(format = 'YYYY-MM-DD') {
    return this.add(function(value) {
      const date = value ? moment(value, format) : null;
  
      if (!date || !date.isValid()) {
        throw new Error('%s is not a valid date.');
      }
  
      return date.format(format);
    });
  };
  
field.prototype.dateTime = function(format = 'YYYY-MM-DD HH:mm') {
return this.date(format);
};

// connect defined routes as middleware to Koa
app.use(router.routes());
// our app will listen on port 3000
app.listen(3000);

console.log('🌍 API listening on 3000');
