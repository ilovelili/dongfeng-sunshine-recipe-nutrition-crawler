const casper = require('casper').create({
    waitTimeout: 5000, // 5s
    verbose: true,
    logLevel: 'error',
    pageSettings: {
        loadImages: false,
        loadPlugins: false
    }
}),
    config = require('config.json'),
    start_month = config['start_month'] || formatMonth(),
    end_month = config['end_month'] || formatMonth(),
    preview_url_placeholder = config['preview_url_placeholder'],
    url = config['url'],
    username = config['username'],
    password = config['password'],
    fs = require('fs'),
    daily_run = config['daily_run'],
    previewlinks = resolvePreviewLinks();

// global
// for some unknown reason the line content will start with comma (,) , which causes column index mismatch, so add a '-' at the beginning of the header.
csvlines = ['-,recipe,carbohydrate,dietaryfiber,protein,fat,heat\r\n'];

casper.userAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36');

casper.start(url, function login() {
    this.echo('step 1: login');
    this.waitForSelector('form#login', function () {
        this.fill('form#login', {
            'userAccount': username,
            'password': password,
        }, true)
    });
});

casper.then(function generate_data() {
    this.echo('step 2. generate nutrition data');
    this.waitForText('食安追溯', function () {
        // loop by date
        this.each(previewlinks, function (self, preview_url) {
            self.thenOpen(preview_url, function () {
                if (self.exists('.product__item')) {
                    // self.capture('screenshots/output1.png');
                    var nutritionlinks = self.evaluate(getNutritionLinks);
                    self.echo('nutrition links length: ' + nutritionlinks.length);

                    self.eachThen(nutritionlinks, function (response) {
                        if (response.data == null) {
                            return;
                        }

                        var nutritionlink = url + response.data;
                        if (nutritionlink.length > 0) {
                            self.thenOpen(nutritionlink, function () {
                                self.waitForText('菜品详情', function () {
                                    var recipe = self.evaluate(function () {
                                        return __utils__.findOne('.head').innerHTML.replace(/\s/g, '');
                                    }),
                                        carbohydrate = self.evaluate(function () {
                                            return parseFloat(__utils__.findOne('.inline_item.right li:nth-child(1) div').innerHTML);
                                        }),
                                        dietaryfiber = self.evaluate(function () {
                                            return parseFloat(__utils__.findOne('.inline_item.right li:nth-child(2) div').innerHTML);
                                        }),
                                        protein = self.evaluate(function () {
                                            return parseFloat(__utils__.findOne('.inline_item.right li:nth-child(3) div').innerHTML);
                                        }),
                                        fat = self.evaluate(function () {
                                            return parseFloat(__utils__.findOne('.inline_item.right li:nth-child(4) div').innerHTML);
                                        }),
                                        heat = self.evaluate(function () {
                                            return parseFloat(__utils__.findOne('.inline_item.right li:nth-child(5) div').innerHTML);
                                        }),
                                        line = recipe + ',' + carbohydrate + ',' + dietaryfiber + ',' + protein + ',' + fat + ',' + heat + '\r\n';

                                    if (line.length > 0) {
                                        csvlines.push(line);

                                        this.echo('csv content: ');
                                        this.echo(csvlines);
                                    }
                                });
                            });
                        }
                    });
                }
            });
        });
    });
});

casper.then(function write_to_csv() {
    this.echo('step 3. write to csv');
    var filename = resolveFileName();

    this.echo('csv content2:');
    this.echo(csvlines);

    fs.write(filename, csvlines, 'w');
})

casper.run();

// ------------------------ event handlers ------------------------
casper.on('remote.message', function (msg) {
    this.echo('remote.msg: ' + msg);
});

casper.on('error', function (msg) {
    this.die(msg);
});

casper.on('run.complete', function () {
    this.echo('completed');
    this.exit();
});

// ------------------------ helpers ------------------------
function formatMonth(date) {
    var d = new Date();
    if (date instanceof Date) {
        d = new Date(date);
    }
    var month = '' + (d.getMonth() + 1),
        year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    return [year, month].join('-');
}

function formatDate(date, exact) {
    var d = new Date(date);
    if (date instanceof Date) {
        d = new Date(date);
    }

    var month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = '' + d.getFullYear(),
        hour = '' + d.getHours(),
        miunte = '' + d.getMinutes(),
        second = '' + d.getSeconds(),
        millisecond = '' + d.getMilliseconds();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    if (hour.length < 2) hour = '0' + hour;
    if (miunte.length < 2) miunte = '0' + miunte;
    if (second.length < 2) second = '0' + second;

    if (exact) {
        return [year, month, day].join('-') + ':' + [hour, miunte, second, millisecond].join(':');
    }

    return [year, month, day].join('-');
}

function resolvePreviewLinks() {
    var links = [];

    // if daily run, get today's csv
    if (daily_run) {
        var d = new Date();
        preview_url = preview_url_placeholder.replace(new RegExp('{{time}}', 'g'), formatDate(d));
        links.push(preview_url);
        return links;
    }

    const start = new Date(start_month.split('-')[0], start_month.split('-')[1]),
        end = new Date(end_month.split('-')[0], end_month.split('-')[1]);

    for (var m = start; m <= end; m.setMonth(m.getMonth() + 1)) {
        var target_month = formatDate(m);
        const year = target_month.split('-')[0],
            month = target_month.split('-')[1] - 1,
            firstDay = new Date(year, month, 1),
            lastDay = new Date(year, month + 1, 0),
            today = new Date();

        if (lastDay > today) {
            lastDay = today
        }

        for (var d = firstDay; d <= lastDay; d.setDate(d.getDate() + 1)) {
            preview_url = preview_url_placeholder.replace(new RegExp('{{time}}', 'g'), formatDate(d));
            links.push(preview_url);
        }
    }

    return links;
}

function getNutritionLinks() {
    var result = [],
        anchors = $('.btn.text-left');

    for (var i = 0; i < anchors.length; i++) {
        var anchor = $(anchors[i]);
        if ($(anchor).attr('href').indexOf('traceDishes.htm?dishesIdMenu') > -1) {
            result.push($(anchor).attr('href'));
        }
    }  

    // for (var anchor of anchors) {
    //     if ($(anchor).attr('href').indexOf('traceDishes.htm?dishesIdMenu') > -1) {
    //         result.push($(anchor).attr('href'));
    //     }
    // }

    return result;
}

function resolveFileName() {
    return fs.pathJoin(fs.workingDirectory, 'output', formatDate(new Date(), true) + '.csv');
}