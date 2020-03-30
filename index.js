const Koa = require('koa');
const bodyParser = require('koa-body');
const datalize = require('datalize');

const field = datalize.field;

const app = new Koa();
const router = new (require('koa-router'))();

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

// connect defined routes as middleware to Koa
app.use(router.routes());
// our app will listen on port 3000
app.listen(3000);

console.log('🌍 API listening on 3000');
