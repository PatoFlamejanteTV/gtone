var canvas, stage, exportRoot;
canvas = document.getElementById("canvas");
exportRoot = new lib.shoutout_illustration();
stage = new createjs.Stage(canvas);
stage.addChild(exportRoot);
stage.update();
createjs.Ticker.setFPS(lib.properties.fps);
createjs.Ticker.addEventListener("tick", stage);
