const Koa = require('koa');
const bodyParser = require('koa-body');
const datalize = require('datalize');

const app = new Koa();
const router = new (require('koa-router'))();

const field = datalize.field;
const DOMAIN_ERROR = "Email's domain does not have a valid MX (mail) entry in its DNS record";

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
]), (ctx) => {
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
]), (ctx) => {
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

// connect defined routes as middleware to Koa
app.use(router.routes());
// our app will listen on port 3000
app.listen(3000);

console.log('🌍 API listening on 3000');
