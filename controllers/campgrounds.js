const Campground=require('../models/campground');
const mbxGeocoding=require('@mapbox/mapbox-sdk/services/geocoding');
const mapBoxToken=process.env.MAPBOX_TOKEN;
const geocoder=mbxGeocoding({ accessToken: mapBoxToken });
const {cloudinary}=require('../cloudinary');
const axios = require('axios');

module.exports.index=async(req,res)=>{
        const campgrounds=await Campground.find({});
        res.render('campgrounds/index',{campgrounds});
    }

module.exports.searchCampgrounds = async (req, res) => {
        const searchQuery = req.query.campgroundName;
        console.log(searchQuery);
        const regex = new RegExp(searchQuery, 'i');
        const campgrounds = await Campground.find({ $or: [
          { title: { $regex: regex } },
          { description: { $regex: regex } },
        ]});
      
        res.render("campgrounds/search", {campgrounds}); 
    }

module.exports.renderNewForm=(req,res)=>{
        res.render('campgrounds/new');
    }

module.exports.createCampground=async (req,res,next)=>{
    // if(!req.body.campground) throw new ExpressError('campground data Invalid',400); //form is validated but still someone can send request (ex- using postman) then its shoul chek if campground object not present then should not save in database insted throw error whih will got to error handler throug next using catchAsync which we have defined 
    
    //instead of writing joi schema and validating here I will define middleware (validateCampgroud) which is passed as an argument  before this funtions runs
   
    const geoData= await geocoder.forwardGeocode({
        query: req.body.campground.location,
        limit: 1
      }).send()

    const campground=new Campground(req.body.campground);
    campground.geometry=geoData.body.features[0].geometry;
    campground.images=req.files.map(f=>({url:f.path, filename:f.filename}));  //it will make an array which will contain objects(in which we have url and filename of image)
    campground.author=req.user._id;
    // console.log(campground);
    await campground.save();
    req.flash('success','successfully made a new campground!');
    res.redirect(`/campgrounds/${campground._id}`);
}



module.exports.showCampground = async (req, res,) => {
    const campground = await Campground.findById(req.params.id).populate({
      path: 'reviews',
      populate:{
        path: 'author'
      }
    }).populate('author');
    if(!campground){
      req.flash('error', 'Cannot find any campground !');
      return res.redirect('/campgrounds');
    }
  
    // calculate individual sentiments-----------------------------------
    let sentimentArray=[];
    let totSentiments = 0;
  
    async function fetchSentiment(i){
      try{
        response = await axios.get("https://sentiment-app-fgxu.onrender.com/sentiment/", { 
          params :{sentence: campground.reviews[i].body} 
        });
        // console.log(parseFloat(response.data.compound))
        let calcScore = (parseFloat(response.data.compound) + 1) * 50;
        totSentiments = totSentiments + calcScore;
        sentimentArray.push((calcScore).toFixed(2));
      }
      catch(error){
        console.error('Error:', error.message);
      }
    };
    for(let i = 0; i < campground.reviews.length; i++){
      await fetchSentiment(i);
    } 
    // console.log(sentimentArray)
    // calculate average sentiments --------------------------------------
    let avgSentiment = totSentiments / campground.reviews.length ;
    avgSentiment = avgSentiment.toFixed(2);
    // console.log(avgSentiment);
    // calculate average review rating-----------------------------------
    let avgRating = 0;
    if(campground.reviews.length){
      const ratings = campground.reviews.map(review => review.rating);
      avgRating = ratings.reduce((acc, cur) => acc + cur) / ratings.length;
    }
    avgRating = avgRating.toFixed(1);
    const starArray = [];
    for(let i = 1; i <= 5; i++){
      if(i <= avgRating){
          starArray.push("width: 100%");
      }
      else{
        if(i - avgRating <= 1){
          const rem = (100 - (i - avgRating) * 100);
          starArray.push("width: " + rem + "%");
        }
        starArray.push("width: 0%");
      }
    }
    res.render('campgrounds/show', { campground, msg: req.flash("success"), avgRating, starArray, sentimentArray, avgSentiment});
}

module.exports.renderEditForm=async(req,res)=>{
    const campground=await Campground.findById(req.params.id);
    if(!campground){
        req.flash('error',"can't find that campground");
        return res.redirect('/campgrounds');
    }
    res.render('campgrounds/edit',{campground});
}

module.exports.updateCampground=async(req,res,next)=>{
    const {id}=req.params;
    // console.log(req.body);
    const campground=await Campground.findByIdAndUpdate(id,req.body.campground,{runValidators:true,new:true});
    const imgs=req.files.map(f=>({url:f.path, filename:f.filename}));
    campground.images.push(...imgs); //push on existing images
    await campground.save();
    if(req.body.deleteImages){
        for(let filename of req.body.deleteImages){
            await cloudinary.uploader.destroy(filename);
        }
        await campground.updateOne({ $pull: { images: { filename: { $in: req.body.deleteImages } } } });
        // console.log(campground);
    }
    req.flash('success','successfully updated a campground!');
    //res.send(req.body.campground);
    res.redirect(`/campgrounds/${campground._id}`);
}

module.exports.deleteCampground=async(req,res)=>{
    const {id}=req.params;
    const campground=await Campground.findByIdAndDelete(id);
    req.flash('success','successfully deleted a campground');
    res.redirect('/campgrounds');
}